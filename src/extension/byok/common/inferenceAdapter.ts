/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A simplified chat message DTO for the inference adapter layer.
 * Maps to the standard OpenAI chat message roles.
 */
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

/**
 * The result of a chat completion request, normalized from
 * the OpenAI `choices[0].message` response shape.
 */
export interface ChatCompletionResult {
	/** The text content of the assistant's response */
	content: string;
	/** The reason the model stopped generating (e.g. 'stop', 'length') */
	finishReason: string;
	/** The model identifier that served the request */
	model: string;
	/** Optional token usage statistics */
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

/**
 * Options that can be passed to a chat completion request.
 */
export interface ChatRequestOptions {
	/** The model identifier to use (e.g. 'gpt-4', 'gpt-3.5-turbo') */
	model?: string;
	/** Sampling temperature between 0 and 2 */
	temperature?: number;
	/** Maximum number of tokens to generate */
	maxTokens?: number;
}

/**
 * IInferenceAdapter defines a standard interface for sending chat completion
 * requests to any OpenAI-compatible inference endpoint.
 *
 * Implementations of this interface abstract away the details of authentication,
 * URL construction, and response parsing, allowing the extension to support
 * enterprise on-premises deployments and BYOK scenarios through a single,
 * consistent API surface.
 */
export interface IInferenceAdapter {
	/**
	 * Sends a chat completion request to the configured inference endpoint.
	 *
	 * @param messages - The array of chat messages forming the conversation history.
	 * @param options - Optional parameters for model selection, temperature, and max tokens.
	 * @returns A promise resolving to the parsed chat completion result.
	 * @throws Error if the request fails or the response cannot be parsed.
	 */
	sendChatRequest(messages: ChatMessage[], options?: ChatRequestOptions): Promise<ChatCompletionResult>;
}
