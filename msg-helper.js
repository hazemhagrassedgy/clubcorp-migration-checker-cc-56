const chalk = require('chalk');

module.exports.magenta = function (msg) {
  console.log(chalk.magenta(msg));
};
module.exports.yellow = function (msg) {
  console.log(chalk.yellow(msg));
};
module.exports.yellowBright = function (msg) {
  console.log(chalk.yellowBright(msg));
};
module.exports.green = function (msg) {
  console.log(chalk.green(msg));
};
module.exports.blue = function (msg) {
  console.log(chalk.blue(msg));
};
module.exports.red = function (msg) {
  console.log(chalk.red(msg));
};
module.exports.white = function (msg) {
  console.log(chalk.white(msg));
};
