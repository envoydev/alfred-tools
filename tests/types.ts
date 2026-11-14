// The shapes the test scaffolding shares: a throwaway world (helpers.ts), and the environment variables the tests and
// their fakes read, named on Node's ProcessEnv so they are read as properties.
import type { world } from './helpers.ts';

export type World = ReturnType<typeof world>;

declare global
{
    namespace NodeJS
    {
        interface ProcessEnv
        {
            PATH?: string | undefined;
            Path?: string | undefined;
            HOME?: string | undefined;
            TMPDIR?: string | undefined;
            TEMP?: string | undefined;
            TMP?: string | undefined;
            SystemRoot?: string | undefined;
            CLAUDE_CONFIG_DIR?: string | undefined;
            FAKE_CLAUDE_FAIL?: string | undefined;
            FAKE_CLAUDE_LOG?: string | undefined;
            FAKE_CLAUDE_MARKET_NAMES?: string | undefined;
            FAKE_CLAUDE_STATE?: string | undefined;
            FAKE_CLAUDE_VERSIONS?: string | undefined;
            FAKE_MCP_LOG_ENV?: string | undefined;
            FAKE_RUNTIME_FAIL?: string | undefined;
            FAKE_RUNTIME_LOG?: string | undefined;
            FAKE_RUNTIME_WAIT?: string | undefined;
            MCP_REMOTE_CONFIG_DIR?: string | undefined;
            PREFERRED_TOOLS_ALFRED?: string | undefined;
            PT_BRIDGE_AUTH?: string | undefined;
            PT_CURSOR_AGENT?: string | undefined;
            PT_PROOF_DIR?: string | undefined;
            UV_CACHE_DIR?: string | undefined;
            ANDROID_HOME?: string | undefined;
            JAVA_HOME?: string | undefined;
            NO_UI?: string | undefined;
        }
    }
}

// seat C
declare global
{
    namespace NodeJS
    {
        interface ProcessEnv
        {
            CLAUDE_CODE_MCP_SERVER_NAME?: string | undefined;
            CLAUDE_CODE_MCP_SERVER_URL?: string | undefined;
            PT_TEST_CACHE?: string | undefined;
            PT_UNSET_TOKEN?: string | undefined;
        }
    }
}
