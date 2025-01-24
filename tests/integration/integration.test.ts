import { run } from '../../src/main';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { generateCommentBody } from '../../src/utils/comment';

// Mock the GitHub Actions core library
const mockedCore = jest.mocked(core, { shallow: true });
const mockedGetInput = mockedCore.getInput;
const mockedSetFailed = mockedCore.setFailed;

// Mock the GitHub Actions github library
const mockedContext = jest.mocked(github.context, { shallow: true });
const mockedGitHub = jest.mocked(github, { shallow: true });

// Mock the generateCommentBody function
jest.mock('../../src/utils/comment', () => ({
    generateCommentBody: jest.fn(),
}));

describe('Integration Test for run() function', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock GitHub context
        mockedContext.repo = {
            owner: 'test-owner',
            repo: 'test-repo',
        };
        mockedContext.payload = {
            pull_request: {
                number: 123,
            },
        };

        // Mock inputs
        mockedCore.getInput.mockImplementation((name: string) => {
            switch (name) {
                case 'report-files':
                    return 'tests/sample_report.json';
                case 'github-token':
                    return 'sample-token';
                case 'openai-api-key':
                    return 'sample-api-key';
                case 'llm-provider':
                    return 'openai';
                default:
                    return '';
            }
        });

        // Assume generateCommentBody returns a static string for testing
        (generateCommentBody as jest.Mock).mockResolvedValue('Test comment body');
    });

    it('should run successfully with valid inputs', async () => {
        // Mock the Octokit (GitHub API client)
        const mockOctokit = {
            rest: {
                issues: {
                    createComment: jest.fn(),
                    update: jest.fn(),
                },
            },
        };
        mockedGitHub.getOctokit.mockReturnValue(mockOctokit as any);

        await run();

        expect(mockedGetInput).toHaveBeenCalledTimes(4);
        expect(mockedSetFailed).not.toHaveBeenCalled();
        expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
            owner: 'test-owner',
            repo: 'test-repo',
            issue_number: 123,
            body: 'Test comment body',
        });
    });

    it('should fail gracefully when report-files input is missing', async () => {
        mockedGetInput.mockImplementation((name: string) => {
            if (name === 'report-files') {
                return '';
            }
            return 'sample-value';
        });

        await run();

        expect(mockedSetFailed).toHaveBeenCalledWith(
            "Input required and not supplied: report-files"
        );
    });
});
