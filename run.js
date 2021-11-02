//Disable HTTPS certificate errors
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
process.env["DEBUG"] = "follow-redirect";

const fs = require('fs');
const urlParser = require('url');
const followRedirects = require('follow-redirects');
const path = require('path');
const async = require('async');
const cheerio = require('cheerio');
const urlStatusCode = require('url-status-code')
const parse = require('csv-parse/lib/sync');
const msg = require('./msg-helper'),
  dal = require('./dal')
  excelManager = require('./excel-manager');

const http = followRedirects.http;
const https = followRedirects.https;

const maxParallelReq = 20;
const args = require("args-parser")(process.argv)

const dataCSVFile = args.data;
if (!dataCSVFile) {
  msg.red('Missing CSV Data File');
  return;
} else {
  msg.yellow('Using data File ' + dataCSVFile);
}

const outputCSVFile = 'output/' + path.basename(dataCSVFile).replace('.csv', '-output.csv');
const outputExcelFile = 'output/' + path.basename(dataCSVFile).replace('.csv', '-output.xlsx');
msg.yellow('Output CSV will be exported to ' + outputCSVFile);

const chunk = (arr, size) =>
  Array.from({
    length: Math.ceil(arr.length / size)
  }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const getData = () => {

  const data = [];
  const dataFile = {
    output: outputCSVFile,
    outputExcel: outputExcelFile,
    path: dataCSVFile,
    data: parse(fs.readFileSync(dataCSVFile))
  };
  dataFile.data.shift();
  data.push(dataFile);
  return data;
};
const getURLAsync = async (urlStr) => {
  return await getURL(urlStr);
}
const getURL = (urlStr) => {
  //decode URL first to handle already encoded URI
  const options = urlParser.parse(encodeURI(decodeURI(urlStr)));
  options.maxRedirects = 10;
  options.timeout = 30000;
  options.trackRedirects = true;
  options.followRedirects = true;

  const protocol = options.protocol === 'https:' ? https : http;
  msg.white('Processing ' + urlStr + ' with ' + options.protocol.replace(':', '') + ' protocol');

  const result = {
    url: urlStr,
    redirects: [],
    redirect: false,
    longRedirect: false,
    infiniteRedirect: false,
    onHTTPS: false,
    clupsNotMigrated: false,
    wwwMigrated: false,
    clubMigrated: false,
    lowerCaseRedirect: false,
    canonicalURL: '',
    valid: false,
    type: 'HTML',
    error: ''
  };
  return new Promise((resolve, reject) => {
    const req = protocol.request(options, response => {
      const body = [];
      response.on('data', (chunk) => {
        body.push(chunk);
      });
      response.on('end', () => {
        data = Buffer.concat(body).toString();

        const $ = cheerio.load(data);
        result.type = options.path.indexOf('globalassets') === -1 ? result.type : 'ASSET';

        const isSoft404 = $('body').html().toLowerCase().indexOf("can't be found") !== -1 ||
          $('body').html().toLowerCase().indexOf("page not found") !== -1;

        const contentLength = response.headers['content-length'];
        result.canonicalURL = $("link[rel='canonical']").attr('href');
        result.canonicalURL = result.canonicalURL ? result.canonicalURL.replace(/(\r\n|\n|\r)/gm, "") : '';

        for (const redirect of response.redirects) {
          result.redirects.push({
            url: redirect.url,
            status: redirect.statusCode
          });
        };
        const finalURL = result.redirects[result.redirects.length - 1].url;
        const finalURLParsed = urlParser.parse(finalURL);

        result.redirect = result.redirects.length > 1 ? true : false;
        result.longRedirect = result.redirects.length > 4 ? true : false;
        result.clupsNotMigrated = finalURL.indexOf('clup.') !== -1;
        result.wwwMigrated = finalURL.indexOf('www.') !== -1;
        if (options.host === 'www.clubcorp.com' && options.path.indexOf('/clubs/' === -1)) {
          result.clubMigrated = true;
        }
        else if (finalURL.indexOf('/clubs/') !== -1) {
          result.clubMigrated = true;
        }

        result.onHTTPS = finalURL.indexOf('https:') !== -1;
        result.lowerCaseRedirect = finalURLParsed.path === finalURLParsed.path.toLocaleLowerCase();

        if (response.statusCode === 200 && contentLength !== null && parseInt(contentLength) === 0) {
          result.redirects[result.redirects.length - 1].status = '404o';
        } else if (response.statusCode === 200 && isSoft404) {
          result.redirects[result.redirects.length - 1].status = '404s';
        }

        result.valid = result.onHTTPS && result.lowerCaseRedirect && result.clubMigrated &&
          result.wwwMigrated && !result.longRedirect && !result.infiniteRedirect && result.canonicalURL !== '' && result.type === 'HTML';
        resolve(result);
      });

    }).on('error', err => {
      msg.red(urlStr + ' ' + err.message);
      result.error = err.message;
      result.redirects.push({
        url: urlStr,
        status: 200
      });
      if (err.message.toLowerCase().indexOf('maximum number of redirects exceeded') !== -1) {
        result.infiniteRedirect = true;
        result.longRedirect = true;
        result.redirect = true;
        result.redirects[0].status = 508;
      } else if (err.message.toLowerCase().indexOf('getaddrinfo') !== -1) {
        result.redirects[0].status = 404;
      }
      resolve(result);
    });
    req.end();
  });

};

const getURLData = async (url, done) => {
  //Add URL to the database if it's not added already
  const dbURL = await dal.createURLIfNotExists(url[0]);
  const events = await dal.getURLRecentEvents(dbURL);
  let event = events.length ? events[0] : null;
  if (!event) {
    const webData = await getURLAsync(url[0]);
    event = await dal.createURLEvent(webData);
  }
  return event;
};

const testFile = async (file) => {
  const urls = file.data;
  const chunks = chunk(file.data, maxParallelReq);
  let progress = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await Promise.all(chunk.map(async (row) => {
      const event = await getURLData(row);

      const date = new Date();

      progress++;
      msg.blue(progress + '-(' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() +
        ') Progress: %' + (Math.floor(100 * progress / file.data.length)).toFixed(2));
    }));
  }
};
const getSortedStatusCodesBasedOnInput = async (urls) => {
  const sortedStatusCodes = [];
  for (const url of urls) {
    const dbURL = await dal.getURL(url[0]);
    const urlStatusCodes = await dal.getURLEvents(dbURL);
    sortedStatusCodes.push(urlStatusCodes);
  }

  return sortedStatusCodes;
};
const exportFileDataToExcel = (file) => {
  excelManager.init();
  excelManager.writeData(file.statusCodes);
  excelManager.flush(file.outputExcel);
};
const start = async (done) => {
  const files = getData();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await testFile(file);
    file.statusCodes = await getSortedStatusCodesBasedOnInput(file.data);
    exportFileDataToExcel(file);
  }
};

(async function() {
  await start();
})().then(v => {
  msg.green('Finished..');
  setTimeout(process.exit, 10000);
});
