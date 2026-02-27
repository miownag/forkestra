ACP Mode
Auggie is a fully compatible Agent Client Protocol (ACP) agent enabling you to bring the power of Augment to any compatible client.

​
About ACP Mode
Agent Client Protocol (ACP) is an open protocol that provides a standardized way to connect AI agents to different text editors, IDEs, and other tools. ACP mode uses JSON-RPC over standard input and output to communicate between the agent and the client. You can see a overview of the protocol to learn more.
​
Using ACP Mode
To use Auggie in ACP mode, you need to pass the --acp flag when starting Auggie. You can pass additional command-line arguments to set the model, authentication, and other options.
auggie --acp
To use Auggie in a ACP-compatible client, you need to configure the client to launch Auggie with the --acp flag and follow the client-specific instructions. See the ACP Clients page for more details.
​
Compatibility
ACP is an emerging protocol and is in active development. Not all features available in interactive mode are supported in ACP mode. We are looking forward to working with the community to add support for more features in the future.
