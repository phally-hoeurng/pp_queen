const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

// The file extension comes from the verified image type, never from the
// uploaded file name. (Customers can now upload without logging in, so a
// fake name like "x.html" must never be saved as a web page.)
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const PROOF_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + crypto.randomBytes(5).toString('hex') + (EXT[file.mimetype] || '.jpg'));
  }
});

const imageFilter = (req, file, cb) => {
  if (EXT[file.mimetype]) return cb(null, true);
  cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed.'));
};

const upload = multer({
  storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024, files: 10 }
});
const paymentProofUpload = multer({
  storage,
  fileFilter: (req, file, cb) => PROOF_EXT[file.mimetype] ? cb(null, true) : cb(new Error('Payment proof must be JPG, JPEG, PNG, WebP or PDF.')) ,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }
});

module.exports = { upload, paymentProofUpload, UPLOAD_DIR };
