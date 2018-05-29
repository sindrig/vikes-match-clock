'use strict';

require('babel-polyfill');

var _glob = require('glob');

var _glob2 = _interopRequireDefault(_glob);

var _flatten = require('lodash/array/flatten');

var _flatten2 = _interopRequireDefault(_flatten);

var _minimist = require('minimist');

var _minimist2 = _interopRequireDefault(_minimist);

var _co = require('co');

var _co2 = _interopRequireDefault(_co);

var _deploy = require('./deploy');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(0, _co2.default)( /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
  var argv, options, globbedFiles, cacheControl, AWSOptions, s3Options, s3ClientOptions, cfOptions;
  return regeneratorRuntime.wrap(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          // Get arguments that were passed from the command line.
          argv = (0, _minimist2.default)(process.argv.slice(2));

          // Create options object, based on command line arguments.

          options = {
            bucket: argv.bucket,
            region: argv.r || argv.region || 'us-east-1',
            cwd: argv.cwd || '',
            profile: argv.profile,
            gzip: argv.gzip ? 'gzip' : undefined,
            index: argv.index || null
          };


          if (argv.hasOwnProperty('filePrefix')) {
            options.filePrefix = argv.filePrefix;
          }

          if (argv.hasOwnProperty('cache')) {
            options.cache = argv.cache;
          }

          if (argv.hasOwnProperty('immutable')) {
            options.immutable = true;
          }

          if (argv.hasOwnProperty('preventUpdates')) {
            options.preventUpdates = true;
          }

          if (argv.hasOwnProperty('etag')) {
            options.etag = argv.etag;
          }

          if (argv.hasOwnProperty('private')) {
            options.private = true;
          }

          if (argv.hasOwnProperty('ext')) {
            options.ext = argv.ext;
          }

          if (argv.hasOwnProperty('signatureVersion')) {
            options.signatureVersion = argv.signatureVersion;
          }

          if (argv.hasOwnProperty('deleteRemoved')) {
            options.deleteRemoved = argv.deleteRemoved;
          }

          if (argv.hasOwnProperty('index')) {
            options.index = argv.index;
          }

          if (argv.hasOwnProperty('distId')) {
            options.distId = argv.distId;
            options.invalidate = argv.invalidate;
          }

          // Get paths of all files from the glob pattern(s) that were passed as the
          // unnamed command line arguments.
          globbedFiles = (0, _flatten2.default)(argv._.filter(Boolean).map(function (pattern) {
            return _glob2.default.sync(pattern);
          }));
          cacheControl = [];

          if (options.hasOwnProperty('cache')) cacheControl.push('max-age=' + options.cache);
          if (options.immutable) cacheControl.push('immutable');
          cacheControl = cacheControl.length ? cacheControl.join(', ') : undefined;

          console.log('Deploying files: %s', globbedFiles);
          console.log('► Target S3 bucket: %s (%s region)', options.bucket, options.region);
          if (options.filePrefix) console.log('► Target file prefix: %s', options.filePrefix);
          if (options.gzip) console.log('► Gzip:', options.gzip);
          if (options.preventUpdates) console.log('► Prevent Updates:', options.preventUpdates);
          if (cacheControl) console.log('► Cache-Control:', cacheControl);
          if (options.etag) console.log('► E-Tag:', options.etag);
          console.log('► Private:', options.private ? true : false);
          if (options.ext) console.log('> Ext:', options.ext);
          if (options.index) console.log('> Index:', options.index);
          if (options.distId) {
            console.log('▼ CloudFront');
            console.log('  ▹ Distribution ID:', options.distId);
            if (options.invalidate) console.log('  ▹ Invalidate files:', options.invalidate);
          }

          AWSOptions = {
            region: options.region
          };
          s3Options = {
            Bucket: options.bucket,
            ContentEncoding: options.gzip,
            CacheControl: cacheControl
          };


          if (options.hasOwnProperty('etag')) {
            s3Options.Metadata = {
              ETag: options.etag
            };
          }

          if (options.private) {
            s3Options.ACL = 'private';
          }

          s3ClientOptions = {};


          if (options.hasOwnProperty('signatureVersion')) {
            s3ClientOptions.signatureVersion = options.signatureVersion;
          }

          cfOptions = {};


          if (options.hasOwnProperty('distId')) {
            cfOptions.distId = options.distId;
            cfOptions.invalidate = options.invalidate;
          }

          // Starts the deployment of all found files.
          _context.next = 39;
          return (0, _deploy.deploy)(globbedFiles, options, AWSOptions, s3Options, s3ClientOptions, cfOptions);

        case 39:
          return _context.abrupt('return', _context.sent);

        case 40:
        case 'end':
          return _context.stop();
      }
    }
  }, _callee, this);
})).then(function () {
  console.log('Upload finished');
}).catch(function (err) {
  if (err.stack) {
    console.error(err.stack);
  } else {
    console.error(String(err));
  }

  process.exit(1); // eslint-disable-line
});