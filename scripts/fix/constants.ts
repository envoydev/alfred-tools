// The named values fix/ reads.

// A token field that is one ${VAR} and nothing else; its one group is the variable's name.
export const ONE_VAR = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
