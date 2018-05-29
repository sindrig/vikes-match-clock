'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deploy = exports.handleFile = exports.readFile = undefined;
exports.upload = upload;
exports.deleteRemoved = deleteRemoved;
exports.sync = sync;

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _zlib = require('zlib');

var _zlib2 = _interopRequireDefault(_zlib);

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

var _clone = require('lodash/lang/clone');

var _clone2 = _interopRequireDefault(_clone);

var _coFsExtra = require('co-fs-extra');

var _coFsExtra2 = _interopRequireDefault(_coFsExtra);

var _co = require('co');

var _co2 = _interopRequireDefault(_co);

var _cloudfront = require('./cloudfront');

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

var _MSG = require('./MSG');

var MSG = _interopRequireWildcard(_MSG);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Uploads a file to AWS S3 bucket.
 * @param  {Object} client AWS Client object.
 * @param  {Object} file   File details of a file to be uploaded.
 * @param  {Object} opts   Object with additional AWS parameters.
 * @return {Promise}        Returns a promise which resolves with a log message of upload status.
 */
function upload(client, file, opts, filePrefix, ext, fileName) {
  return new Promise(function (resolve, reject) {
    opts = Object.assign({
      ACL: 'public-read'
    }, opts);

    var params = Object.assign({}, utils.buildUploadParams(file, filePrefix, ext, fileName), opts);
    params = utils.handleETag(params);
    var dest = params.Key;

    // Upload the file to s3.
    client.putObject(params, function (err) {
      if (err) {
        return reject(_util2.default.format(MSG.ERR_UPLOAD, err, err.stack));
      }

      return resolve(_util2.default.format(MSG.UPLOAD_SUCCESS, params.Bucket, dest));
    });
  });
}

function deleteRemoved(client, files, options) {

  var params = {
    Bucket: options.bucket
  };

  return new Promise(function (resolve, reject) {
    client.listObjects(params, function (err, data) {
      if (err) {
        return reject(_util2.default.format(MSG.ERR_UPLOAD, err, err.stack));
      } // an error occurred
      var s3files = data.Contents.map(function (item) {
        return item.Key;
      });
      var localFiles = files.map(function (item) {
        return item.substr(options.cwd.length);
      });
      var toDelete = s3files.filter(function (item) {
        return !localFiles.includes(item);
      });

      if (toDelete.length > 0) {

        console.log('Deleting files: %s', toDelete);

        var _params = {
          Bucket: options.bucket,
          Delete: {
            Objects: toDelete.map(function (item) {
              return { Key: item };
            })
          }
        };

        client.deleteObjects(_params, function (err, data) {
          if (err) {
            return reject(_util2.default.format(MSG.ERR_UPLOAD, err, err.stack));
          } // an error occurred


          return resolve(_util2.default.format(MSG.DELETE_SUCCESS, toDelete));
        });
      } else {
        console.log('No files to delete.');
      }
    });
  });
}

/**
 * Checks if file is already in the S3 bucket.
 * @param  {Object}  client         AWS Client object.
 * @param  {Object}  file           File details of a file to check.
 * @param  {Object}  opts           Object with additional AWS parameters.
 * @param  {Boolean} preventUpdates Prevent updating the object, even if changed
 * @return {Promise}                Returns a promise which rejects if file already exists,
 *                                  and doesn't need update. Otherwise fulfills.
 */
function sync(client, file, filePrefix, opts, preventUpdates, fileName) {
  return new Promise(function (resolve, reject) {
    var expectedHash = utils.createMd5Hash(file.contents);
    var params = {
      IfNoneMatch: expectedHash,
      Bucket: opts.Bucket
    };
    if (!preventUpdates) {
      params.IfUnmodifiedSince = file.stat.mtime;
    }
    Object.assign(params, utils.buildBaseParams(file, filePrefix, fileName));
    client.headObject(params, function (err, data) {
      if (err && (err.statusCode === 304 || err.statusCode === 412)) {
        return reject(_util2.default.format(MSG.SKIP_MATCHES, params.Key));
      }

      if (preventUpdates && data) {
        return reject(_util2.default.format(MSG.ERR_CHECKSUM, expectedHash, data.ETag, params.Key));
      }

      if (data || err.statusCode === 404) {
        return resolve();
      }

      reject(_util2.default.format(MSG.ABORT_UPLOAD, err.code, err.message, params.Key));
    });
  });
}

/**
 * Checks if the provided path is a file or directory.
 * If it is a file, it returns file details object.
 * Otherwise it returns undefined.
 */
var readFile = exports.readFile = _co2.default.wrap( /*#__PURE__*/regeneratorRuntime.mark(function _callee(filepath, cwd, gzipFiles) {
  var stat, fileContents;
  return regeneratorRuntime.wrap(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          stat = _coFsExtra2.default.statSync(filepath);

          if (!stat.isFile()) {
            _context.next = 7;
            break;
          }

          _context.next = 4;
          return _coFsExtra2.default.readFile(filepath, { encoding: null });

        case 4:
          fileContents = _context.sent;


          if (gzipFiles) {
            fileContents = _zlib2.default.gzipSync(fileContents);
          }

          return _context.abrupt('return', {
            stat: stat,
            contents: fileContents,
            base: _path2.default.join(process.cwd(), cwd),
            path: _path2.default.join(process.cwd(), filepath)
          });

        case 7:
          return _context.abrupt('return', undefined);

        case 8:
        case 'end':
          return _context.stop();
      }
    }
  }, _callee, this);
}));

/**
 * Handles a path, by obtaining file details for a provided path,
 * checking if file is already in AWS bucket and needs updates,
 * and uploading files that are not there yet, or do need an update.
 */
var handleFile = exports.handleFile = _co2.default.wrap( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(filePath, cwd, filePrefix, client, s3Options, ext, indexName, preventUpdates) {
  var fileObject, aliases, i, name, fileUploadStatus, _name;

  return regeneratorRuntime.wrap(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.next = 2;
          return readFile(filePath, cwd, s3Options.ContentEncoding !== undefined);

        case 2:
          fileObject = _context2.sent;

          if (!(fileObject !== undefined)) {
            _context2.next = 36;
            break;
          }

          aliases = utils.buildIndexes(fileObject, indexName);
          _context2.prev = 5;
          _context2.next = 8;
          return sync(client, fileObject, filePrefix, s3Options, preventUpdates);

        case 8:
          if (!(aliases && aliases.length > 0)) {
            _context2.next = 17;
            break;
          }

          i = 0;

        case 10:
          if (!(i < aliases.length)) {
            _context2.next = 17;
            break;
          }

          name = aliases[i];
          _context2.next = 14;
          return sync(client, fileObject, filePrefix, s3Options, preventUpdates, name);

        case 14:
          i++;
          _context2.next = 10;
          break;

        case 17:
          _context2.next = 23;
          break;

        case 19:
          _context2.prev = 19;
          _context2.t0 = _context2['catch'](5);

          console.log(_context2.t0);
          return _context2.abrupt('return');

        case 23:
          _context2.next = 25;
          return upload(client, fileObject, s3Options, filePrefix, ext);

        case 25:
          fileUploadStatus = _context2.sent;

          if (!(aliases && aliases.length > 0)) {
            _context2.next = 35;
            break;
          }

          i = 0;

        case 28:
          if (!(i < aliases.length)) {
            _context2.next = 35;
            break;
          }

          _name = aliases[i];
          _context2.next = 32;
          return upload(client, fileObject, s3Options, filePrefix, ext, _name);

        case 32:
          i++;
          _context2.next = 28;
          break;

        case 35:
          console.log(fileUploadStatus);

        case 36:
        case 'end':
          return _context2.stop();
      }
    }
  }, _callee2, this, [[5, 19]]);
}));

/**
 * Entry point, creates AWS client, prepares AWS options,
 * and handles all provided paths.
 */
var deploy = exports.deploy = _co2.default.wrap( /*#__PURE__*/regeneratorRuntime.mark(function _callee3(files, options, AWSOptions, s3Options) {
  var clientOptions = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};
  var cfOptions = arguments[5];
  var cwd, filePrefix, credentials, client;
  return regeneratorRuntime.wrap(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          AWSOptions = (0, _clone2.default)(AWSOptions, true);
          s3Options = (0, _clone2.default)(s3Options, true);
          cwd = options.cwd;
          filePrefix = options.filePrefix || '';


          if (options.profile) {
            credentials = new _awsSdk2.default.SharedIniFileCredentials({ profile: options.profile });

            _awsSdk2.default.config.credentials = credentials;
          }

          _awsSdk2.default.config.update(Object.assign({
            sslEnabled: true
          }, AWSOptions));

          client = new _awsSdk2.default.S3(clientOptions);
          _context3.next = 9;
          return Promise.all(files.map(function (filePath) {
            return handleFile(filePath, cwd, filePrefix, client, s3Options, options.ext, options.index, options.preventUpdates);
          }));

        case 9:

          if (cfOptions.distId) {
            (0, _cloudfront.invalidate)(cfOptions.distId, cfOptions.invalidate);
          }

          if (options.deleteRemoved) {
            deleteRemoved(client, files, options);
          }

        case 11:
        case 'end':
          return _context3.stop();
      }
    }
  }, _callee3, this);
}));