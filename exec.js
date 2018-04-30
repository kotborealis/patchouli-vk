const {promisify} = require('util');
const exec = promisify(require('child_process').exec);

module.exports = cmd => exec(cmd, {env: process.env});