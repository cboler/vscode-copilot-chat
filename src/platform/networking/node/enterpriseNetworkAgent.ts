/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { ILogService } from '../../log/common/logService';

/**
 * EnterpriseNetworkAgent provides mTLS (Mutual TLS) support for enterprise
 * deployments that require client-certificate authentication when communicating
 * with secure API gateways.
 *
 * The class reads a certificate file (`.pem` or `.p7b`) from a user-configured
 * path (`enterprise.certificatePath`) and injects it into a Node.js
 * `https.Agent` under the `ca` and `cert` options.
 *
 * If the configured path is empty, missing, or the file cannot be read, the
 * class gracefully falls back to a default `https.Agent` and logs a
 * diagnostic warning.
 *
 * Usage:
 * ```ts
 * const agent = new EnterpriseNetworkAgent(certificatePath, logService);
 * const httpsAgent = agent.getHttpsAgent();
 * ```
 */
export class EnterpriseNetworkAgent {

	private _cachedAgent: https.Agent | undefined;

	constructor(
		private readonly _certificatePath: string,
		private readonly _logService: ILogService,
	) { }

	/**
	 * Returns a configured `https.Agent` suitable for outbound HTTPS requests.
	 *
	 * - When a valid `certificatePath` is configured, the returned agent
	 *   includes the certificate material under `ca` and `cert`, enabling
	 *   mTLS handshakes with enterprise API gateways.
	 * - When no path is configured or the file cannot be read, a standard
	 *   `https.Agent` with connection keep-alive is returned.
	 *
	 * The agent instance is cached after first creation and reused on
	 * subsequent calls.
	 */
	public getHttpsAgent(): https.Agent {
		if (this._cachedAgent) {
			return this._cachedAgent;
		}

		this._cachedAgent = this._createAgent();
		return this._cachedAgent;
	}

	/**
	 * Attempts to build an `https.Agent` with mTLS certificate material.
	 * Falls back to a default agent on any error.
	 */
	private _createAgent(): https.Agent {
		if (!this._certificatePath) {
			this._logService.info(
				'[EnterpriseNetworkAgent] No certificate path configured. Using default HTTPS agent.'
			);
			return new https.Agent({ keepAlive: true });
		}

		try {
			// Normalize the path for cross-platform compatibility
			const resolvedPath = path.resolve(this._certificatePath);

			if (!fs.existsSync(resolvedPath)) {
				this._logService.warn(
					`[EnterpriseNetworkAgent] Certificate file not found at "${resolvedPath}". Falling back to default HTTPS agent.`
				);
				return new https.Agent({ keepAlive: true });
			}

			const certData = fs.readFileSync(resolvedPath);

			// Validate that the file is non-empty
			if (certData.length === 0) {
				this._logService.warn(
					`[EnterpriseNetworkAgent] Certificate file at "${resolvedPath}" is empty. Falling back to default HTTPS agent.`
				);
				return new https.Agent({ keepAlive: true });
			}

			const agent = new https.Agent({
				keepAlive: true,
				ca: certData,
				cert: certData,
			});

			this._logService.info(
				`[EnterpriseNetworkAgent] mTLS agent created with certificate from "${resolvedPath}" (${certData.length} bytes).`
			);

			return agent;
		} catch (error) {
			this._logService.error(
				error,
				`[EnterpriseNetworkAgent] Failed to read certificate from "${this._certificatePath}". Falling back to default HTTPS agent.`
			);
			return new https.Agent({ keepAlive: true });
		}
	}
}
