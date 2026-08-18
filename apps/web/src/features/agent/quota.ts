// The send-gate rule lives in @looper/data/agent so Recording Assistant clients
// share one source of truth. Re-exported here so existing feature-local imports
// (chat-ui, chat-composer) keep their short path.
export { quotaBlocksSend } from "@looper/data/agent";
