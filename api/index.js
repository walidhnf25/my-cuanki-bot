// Vercel function entry: every route is rewritten here (see vercel.json) and
// served by the compiled Nest app that `npm run build` writes to dist/.
module.exports = require('../dist/serverless').default;
