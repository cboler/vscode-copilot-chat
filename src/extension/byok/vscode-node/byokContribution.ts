/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageModelChatInformation, LanguageModelChatProvider, lm } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKKnownModels, isBYOKEnabled } from '../../byok/common/byokProvider';
import { IInferenceAdapter } from '../../byok/common/inferenceAdapter';
import { IExtensionContribution } from '../../common/contributions';
import { GenericOpenAIAdapter } from '../node/genericOpenAIAdapter';
import { EnterpriseNetworkAgent } from '../../../platform/networking/node/enterpriseNetworkAgent';
import { AnthropicLMProvider } from './anthropicProvider';
import { AzureBYOKModelProvider } from './azureProvider';
import { BYOKStorageService, IBYOKStorageService } from './byokStorageService';
import { CustomOAIBYOKModelProvider } from './customOAIProvider';
import { GeminiNativeBYOKLMProvider } from './geminiNativeProvider';
import { OllamaLMProvider } from './ollamaProvider';
import { OAIBYOKLMProvider } from './openAIProvider';
import { OpenRouterLMProvider } from './openRouterProvider';
import { XAIBYOKLMProvider } from './xAIProvider';

export class BYOKContrib extends Disposable implements IExtensionContribution {
	public readonly id: string = 'byok-contribution';
	private readonly _byokStorageService: IBYOKStorageService;
	private readonly _providers: Map<string, LanguageModelChatProvider<LanguageModelChatInformation>> = new Map();
	private _byokProvidersRegistered = false;

	/**
	 * Holds the enterprise adapter instance when `enterprise.customEndpointUrl` is configured.
	 * Access via the static `getEnterpriseAdapter()` method.
	 */
	private _enterpriseAdapter: IInferenceAdapter | undefined;
	private static _instance: BYOKContrib | undefined;

	/**
	 * Returns the enterprise GenericOpenAIAdapter if the `enterprise.customEndpointUrl`
	 * configuration value is populated, otherwise returns `undefined`.
	 *
	 * This allows internal callers to conditionally route requests through
	 * the enterprise adapter instead of the default Copilot inference pipeline.
	 */
	public static getEnterpriseAdapter(): IInferenceAdapter | undefined {
		return BYOKContrib._instance?._enterpriseAdapter;
	}

	constructor(
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@ILogService private readonly _logService: ILogService,
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@IAuthenticationService authService: IAuthenticationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		BYOKContrib._instance = this;
		this._byokStorageService = new BYOKStorageService(extensionContext);
		this._authChange(authService, this._instantiationService);

		this._register(authService.onDidAuthenticationChange(() => {
			this._authChange(authService, this._instantiationService);
		}));
	}

	private async _authChange(authService: IAuthenticationService, instantiationService: IInstantiationService) {
		if (authService.copilotToken && isBYOKEnabled(authService.copilotToken, this._capiClientService) && !this._byokProvidersRegistered) {
			this._byokProvidersRegistered = true;
			// Update known models list from CDN so all providers have the same list
			const knownModels = await this.fetchKnownModelList(this._fetcherService);
			if (this._store.isDisposed) {
				return;
			}
			this._providers.set(OllamaLMProvider.providerName.toLowerCase(), instantiationService.createInstance(OllamaLMProvider, this._byokStorageService));
			this._providers.set(AnthropicLMProvider.providerName.toLowerCase(), instantiationService.createInstance(AnthropicLMProvider, knownModels[AnthropicLMProvider.providerName], this._byokStorageService));
			this._providers.set(GeminiNativeBYOKLMProvider.providerName.toLowerCase(), instantiationService.createInstance(GeminiNativeBYOKLMProvider, knownModels[GeminiNativeBYOKLMProvider.providerName], this._byokStorageService));
			this._providers.set(XAIBYOKLMProvider.providerName.toLowerCase(), instantiationService.createInstance(XAIBYOKLMProvider, knownModels[XAIBYOKLMProvider.providerName], this._byokStorageService));
			this._providers.set(OAIBYOKLMProvider.providerName.toLowerCase(), instantiationService.createInstance(OAIBYOKLMProvider, knownModels[OAIBYOKLMProvider.providerName], this._byokStorageService));
			this._providers.set(OpenRouterLMProvider.providerName.toLowerCase(), instantiationService.createInstance(OpenRouterLMProvider, this._byokStorageService));
			this._providers.set(AzureBYOKModelProvider.providerName.toLowerCase(), instantiationService.createInstance(AzureBYOKModelProvider, this._byokStorageService));
			this._providers.set(CustomOAIBYOKModelProvider.providerName.toLowerCase(), instantiationService.createInstance(CustomOAIBYOKModelProvider, this._byokStorageService));

			for (const [providerName, provider] of this._providers) {
				this._store.add(lm.registerLanguageModelChatProvider(providerName, provider));
			}
		}

		// Enterprise adapter: if `enterprise.customEndpointUrl` is configured,
		// instantiate a GenericOpenAIAdapter for the enterprise on-premises endpoint.
		this._initEnterpriseAdapter();
	}
	/**
	 * Checks if the `enterprise.customEndpointUrl` configuration is populated
	 * and, if so, creates a GenericOpenAIAdapter instance targeting that endpoint.
	 */
	private _initEnterpriseAdapter(): void {
		const customEndpointUrl = this._configurationService.getConfig(ConfigKey.Enterprise.CustomEndpointUrl);
		const apiKey = this._configurationService.getConfig(ConfigKey.Enterprise.ApiKey);
		const certificatePath = this._configurationService.getConfig(ConfigKey.Enterprise.CertificatePath);

		if (customEndpointUrl) {
			this._logService.info(`[BYOKContrib] Enterprise custom endpoint configured: ${customEndpointUrl}`);

			// Create the mTLS network agent if a certificate path is configured
			const networkAgent = new EnterpriseNetworkAgent(certificatePath, this._logService);

			this._enterpriseAdapter = new GenericOpenAIAdapter(
				customEndpointUrl,
				apiKey,
				this._fetcherService,
				this._logService,
				networkAgent,
			);
		} else {
			this._enterpriseAdapter = undefined;
		}
	}

	private async fetchKnownModelList(fetcherService: IFetcherService): Promise<Record<string, BYOKKnownModels>> {
		const data = await (await fetcherService.fetch('https://main.vscode-cdn.net/extensions/copilotChat.json', { method: 'GET', callSite: 'byok-known-models' })).json();
		// Use this for testing with changes from a local file. Don't check in
		// const data = JSON.parse((await this._fileSystemService.readFile(URI.file('/Users/roblou/code/vscode-engineering/chat/copilotChat.json'))).toString());
		let knownModels: Record<string, BYOKKnownModels>;
		if (data.version !== 1) {
			this._logService.warn('BYOK: Copilot Chat known models list is not in the expected format. Defaulting to empty list.');
			knownModels = {};
		} else {
			knownModels = data.modelInfo;
		}
		this._logService.info('BYOK: Copilot Chat known models list fetched successfully.');
		return knownModels;
	}
}