const app = require('../server.js');

module.exports = app;

// Disable Vercel's default body parser so Multer can read the raw image stream
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
