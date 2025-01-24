import { analyzeCode } from '../../src/utils/ai_tutor';
import { OpenAIApi, Configuration } from 'openai';

// Mock the entire openai module
jest.mock('openai');

const mockedOpenAIApi = jest.mocked(OpenAIApi, { shallow: true });
const mockedConfiguration = jest.mocked(Configuration, { shallow: true });

// Mock fetch
global.fetch = jest.fn();
const mockedFetch = jest.mocked(fetch, { shallow: true });

// Helper function to create a mock fetch response
const createMockFetchResponse = (data: unknown, status = 200) => {
    return {
        json: () => Promise.resolve(data),
        status,
        ok: status >= 200 && status < 300,
    };
};

describe('analyzeCode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedOpenAIApi.mockClear();
        mockedConfiguration.mockClear();
    });

    it('should return analysis from LLM', async () => {
        const codeSnippet = 'function add(a, b) { return a + b; }';
        const language = 'javascript';
        const analysis = 'This function adds two numbers.';

        mockedOpenAIApi.mockImplementation(
            () =>
            ({
                createCompletion: jest.fn().mockResolvedValue({
                    data: { choices: [{ text: analysis }] },
                }),
            } as unknown as OpenAIApi) // Cast to unknown first, then to OpenAIApi
        );

        const result = await analyzeCode(
            codeSnippet,
            language,
            'sample-api-key',
            'openai'
        );

        expect(mockedConfiguration).toHaveBeenCalledWith({
            apiKey: 'sample-api-key',
        });
        expect(mockedOpenAIApi).toHaveBeenCalled();
        expect(result).toBe(analysis);
    });

    it('should return analysis from custom LLM', async () => {
        const codeSnippet = 'def add(a, b):\n  return a + b';
        const language = 'python';
        const analysis = 'This function adds two numbers.';

        mockedFetch.mockResolvedValue(
            createMockFetchResponse({ choices: [{ text: analysis }] })
        );

        const result = await analyzeCode(
            codeSnippet,
            language,
            'http://custom-llm-url',
            'custom'
        );

        expect(mockedFetch).toHaveBeenCalledWith('http://custom-llm-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: expect.any(String), // You can make this more specific if needed
        });
        expect(result).toBe(analysis);
    });

    it('should throw an error if LLM response is invalid', async () => {
        const codeSnippet = 'function add(a, b) { return a + b; }';
        const language = 'javascript';

        mockedOpenAIApi.mockImplementation(
            () =>
            ({
                createCompletion: jest.fn().mockResolvedValue({
                    data: { choices: [] },
                }), // Invalid response: no text
            } as unknown as OpenAIApi) // Cast to unknown first, then to OpenAIApi
        );

        await expect(
            analyzeCode(codeSnippet, language, 'sample-api-key', 'openai')
        ).rejects.toThrow('Invalid response from LLM');
    });
    it('should throw an error if custom LLM response is invalid', async () => {
        const codeSnippet = 'def add(a, b):\n  return a + b';
        const language = 'python';

        mockedFetch.mockResolvedValue(
            createMockFetchResponse({ choices: [] })
        ); // Invalid response: no text

        await expect(
            analyzeCode(codeSnippet, language, 'http://custom-llm-url', 'custom')
        ).rejects.toThrow('Invalid response from LLM');
    });
});
