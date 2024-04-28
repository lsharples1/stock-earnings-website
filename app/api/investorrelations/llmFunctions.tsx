import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { parseJsonArrayUtil } from './utils';

/**
 * 
 * @param prompt the prompt to send to OpenAI
 * @returns the response from OpenAI
 */
export async function openAiChatResponse(prompt: string) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      });
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
        console.log('openai response', response);
        const message = response.choices[0].message;
        console.log('message', message);
        if (message.content) {
            return JSON.parse(message.content)
        } else {
            console.error('Error with OpenAI response', message);
            throw new Error('Error with OpenAI response');
        }
}
export async function anthropicChatResponse(prompt: string) {
    const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!,
      });

    const response = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 4096,
    system: "ONLY REPLY WITH JSON. DO NOT INCLUDE ANY TEXT OTHER THAN JSON IN YOUR RESPONSE.",
    messages: [
        { role: "user", content: prompt }
    ],
    });
    console.log('anthropic response', response);
    const message = response.content[0];
    console.log('message', message);
    if (message.text) {
        const parsedResponse = parseJsonArrayUtil(message.text);
        console.log('parsedResponse from anthropic model', parsedResponse);
        return parsedResponse;
    } else {
        console.error('Error with Anthropic response', message);
        throw new Error('Error with Anthropic response');
    }
}