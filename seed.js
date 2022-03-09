//Disable HTTPS certificate errors
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
process.env["DEBUG"] = "follow-redirect";

const fs = require('fs');
const path = require('path');
const async = require('async');
const parse = require('csv-parse/lib/sync');
const msg = require('./msg-helper'),
  dal = require('./dal');

const getSeedData = () => {
  const data = [];
  const files = fs.readdirSync('./seed').sort((a, b) => {
    const timeA = new Date (a.replace('.csv', ''));
    const timeB = new Date (b.replace('.csv', ''));
     return timeA - timeB; 
  });
  console.log(files);
  for (const file of files) {
    const dataPath = './seed/' + file;
    const dataFile = {
      name: file,
      path: dataPath,
      data: parse(fs.readFileSync(dataPath))
    };
    dataFile.data.shift();
    data.push(dataFile);
  }
  return data;
};


const testFile = async (file) => {
  const urls = file.data;
  let progress = 0;

  for (const row of urls) {
    let seedURL = await dal.getURLLookup(row[2]);
    if (!seedURL) {
      seedURL = await dal.createURLLookup(row);
    } else if(seedURL && seedURL.page !== row[1] && row[1] !== ''){
      // Update only the source page is changed
      msg.yellow('Updating ' + row[2] + ' seed record');
      seedURL = await dal.updateURLLookup(seedURL, row);
    }

    const date = new Date();

    progress++;
    msg.blue(progress + '-(' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() +
      ') - ( ' + file.name + ' ) Progress: %' + (Math.floor(100 * progress / file.data.length)).toFixed(2));
  }
};

const start = async (done) => {
  await dal.clearURLLookup();
  const files = getSeedData();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await testFile(file);
  }
};

(async function () {
  await start();
})().then(v => {
  msg.green('Finished..');
  setTimeout(process.exit, 10000);
});
