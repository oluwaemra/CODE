// Wraps a handler so an unexpected error (e.g. a missing Redis config)
// returns a JSON 500 instead of crashing the function with an HTML page.
module.exports = function safeHandler(handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      console.error(`${req.url} failed:`, err);
      if (res.headersSent) return;
      const notConfigured = /not configured/i.test(err && err.message);
      return res.status(500).json({
        ok: false,
        error: notConfigured ? "Database is not configured yet." : "Something went wrong on the server.",
      });
    }
  };
};
