/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ChatCompletionResult, ChatMessage, ChatRequestOptions, IInferenceAdapter } from '../common/inferenceAdapter';

/**
 * Raw shape of the OpenAI chat/completions response.
 * Only the fields we need for parsing are declared.
 */
interface OpenAIChatCompletionResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: string;
			content: string | null;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * GenericOpenAIAdapter implements IInferenceAdapter by formatting requests
 * against the standard OpenAI chat/completions REST endpoint.
 *
 * This adapter is designed for enterprise on-premises deployments where
 * customers bring their own API key and point to a generic OpenAI-compatible
 * inference server (e.g. Azure OpenAI, vLLM, LocalAI, LiteLLM, etc.).
 *
 * Usage:
 * ```ts
 * const adapter = new GenericOpenAIAdapter(
 *     'https://my-company.openai.azure.com/v1',
 *     'sk-...',
 *     fetcherService,
 *     logService
 * );
 * const result = await adapter.sendChatRequest([
 *     { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */
export class GenericOpenAIAdapter implements IInferenceAdapter {

	private static readonly DEFAULT_MODEL = 'gpt-4';
	private static readonly DEFAULT_TEMPERATURE = 0.7;
	private static readonly REQUEST_TIMEOUT_MS = 60_000;

	private readonly _endpointUrl: string;

	constructor(
		endpointUrl: string,
		private readonly _apiKey: string,
		private readonly _fetcherService: IFetcherService,
		private readonly _logService: ILogService,
	) {
		// Normalize the endpoint URL: ensure it ends with /chat/completions
		this._endpointUrl = GenericOpenAIAdapter._resolveCompletionsUrl(endpointUrl);
		this._logService.info(`[GenericOpenAIAdapter] Initialized with endpoint: ${this._endpointUrl}`);
	}

	/**
	 * Sends a chat completion request to the configured OpenAI-compatible endpoint.
	 *
	 * The outbound request body conforms to the standard OpenAI chat/completions
	 * JSON schema. The response is parsed and the first choice's message content
	 * is extracted and returned.
	 */
	public async sendChatRequest(
		messages: ChatMessage[],
		options?: ChatRequestOptions,
	): Promise<ChatCompletionResult> {
		const model = options?.model ?? GenericOpenAIAdapter.DEFAULT_MODEL;
		const temperature = options?.temperature ?? GenericOpenAIAdapter.DEFAULT_TEMPERATURE;

		// Build the request body per the OpenAI chat/completions schema
		const requestBody: Record<string, unknown> = {
			model,
			messages: messages.map(msg => ({
				role: msg.role,
				content: msg.content,
			})),
			temperature,
			stream: false,
		};

		if (options?.maxTokens !== undefined) {
			requestBody['max_tokens'] = options.maxTokens;
		}

		this._logService.info(
			`[GenericOpenAIAdapter] Sending chat request to ${this._endpointUrl} ` +
			`(model=${model}, messages=${messages.length}, temperature=${temperature})`
		);

		try {
			const response = await this._fetcherService.fetch(this._endpointUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this._apiKey}`,
				},
				json: requestBody,
				timeout: GenericOpenAIAdapter.REQUEST_TIMEOUT_MS,
				callSite: 'enterprise-generic-openai-adapter',
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`[GenericOpenAIAdapter] Request failed with status ${response.status}: ${errorText}`
				);
			}

			const data: OpenAIChatCompletionResponse = await response.json();
			return GenericOpenAIAdapter._parseResponse(data);
		} catch (error) {
			this._logService.error(error, '[GenericOpenAIAdapter] Chat request failed');
			throw error;
		}
	}

	/**
	 * Parses a standard OpenAI chat/completions response into our
	 * internal ChatCompletionResult format.
	 */
	private static _parseResponse(data: OpenAIChatCompletionResponse): ChatCompletionResult {
		if (!data.choices || data.choices.length === 0) {
			throw new Error(
				'[GenericOpenAIAdapter] Invalid response: no choices returned'
			);
		}

		const firstChoice = data.choices[0];
		const content = firstChoice.message?.content ?? '';

		const result: ChatCompletionResult = {
			content,
			finishReason: firstChoice.finish_reason ?? 'stop',
			model: data.model,
		};

		if (data.usage) {
			result.usage = {
				promptTokens: data.usage.prompt_tokens,
				completionTokens: data.usage.completion_tokens,
				totalTokens: data.usage.total_tokens,
			};
		}

		return result;
	}

	/**
	 * Resolves a user-provided endpoint URL to a full chat/completions URL.
	 *
	 * Handles these cases:
	 * - URL already contains `/chat/completions` → used as-is
	 * - URL ends with a version segment like `/v1` → appends `/chat/completions`
	 * - Base URL only → appends `/v1/chat/completions`
	 *
	 * Trailing slashes are stripped before resolution.
	 */
	private static _resolveCompletionsUrl(url: string): string {
		// Strip trailing slash
		if (url.endsWith('/')) {
			url = url.slice(0, -1);
		}

		// Already fully qualified
		if (url.includes('/chat/completions')) {
			return url;
		}

		// Has a version segment (e.g. /v1, /v2)
		if (/\/v\d+$/.test(url)) {
			return `${url}/chat/completions`;
		}

		// Base URL — append the standard path
		return `${url}/v1/chat/completions`;
	}
}
