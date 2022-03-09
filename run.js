//Disable HTTPS certificate errors
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
process.env["DEBUG"] = "follow-redirect";

// Helpers (Prototypes)
String.prototype.isClubCorpHost = function () {
  return this.indexOf('clubcorp.com') !== -1;
};
String.prototype.isClubCorpWWWHost = function () {
  return this.indexOf('www.clubcorp.com') !== -1;
};
String.prototype.isClubCorpClubHost = function () {
  return this.indexOf('club.clubcorp.com') !== -1;
};

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
exportManager = require('./export-manager');

const http = followRedirects.http;
const https = followRedirects.https;

const maxParallelReq = 10;
const args = require("args-parser")(process.argv)

const dataCSVFile = args.data;
if (!dataCSVFile) {
  msg.red('Missing CSV Data File');
  return;
} else {
  msg.yellow('Using data File ' + dataCSVFile);
}

const outputFolder = 'output/' + path.basename(dataCSVFile).replace('.csv', '') + '/';
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder, { recursive: true });
}
msg.yellow('Output will be exported to ' + outputFolder);

const chunk = (arr, size) =>
  Array.from({
    length: Math.ceil(arr.length / size)
  }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const getData = () => {

  const data = [];
  const dataFile = {
    output: outputFolder,
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
  options.timeout = 10000;
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
    clubMigrated: true,
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
        if (options.path.indexOf('globalassets') !== -1 || options.path.indexOf('contentassets') !== -1) {
          result.type = 'ASSET';
        }


        const isSoft404 = $('body').html().toLowerCase().indexOf("404") !== -1 && ($('body').html().toLowerCase().indexOf("can't be found") !== -1 ||
          $('body').html().toLowerCase().indexOf("page not found") !== -1);

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
        if ((options.host.isClubCorpClubHost() || options.host.indexOf('club.com') !== -1) && finalURL.indexOf('/clubs/') === -1) {
          result.clubMigrated = false;
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
      result.wwwMigrated = urlStr.indexOf('www.') !== -1;
      result.onHTTPS = urlStr.indexOf('https:') !== -1;
      result.lowerCaseRedirect = options.path === options.path.toLocaleLowerCase();

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
const getSortedFilteredStatusCodesBasedOnInput = async (urls) => {
  const sortedStatusCodes = [];
  for (const url of urls) {
    const dbURL = await dal.getURL(url[0]);
    const lookup = await dal.getURLLookup(url[0]);
    const urlStatusCodes = await dal.getURLEvents(dbURL);
    
    const category = url.length > 0 && url[1] ? url[1] : 'normal';

    const isClubCorpURL = dbURL.isClubCorpHost();
    const isClubCorpPage = lookup ? lookup.isClubCorpPageHost() : true;

    if(isClubCorpURL && isClubCorpPage){
      for (const statusCode of urlStatusCodes) {
        statusCode.category = category;
        statusCode.page = lookup ? lookup : '';
      }
      sortedStatusCodes.push(urlStatusCodes);
    }
  }
  return sortedStatusCodes;
};


const exportFileDataToExcel = (file) => {
  exportManager.init();
  exportManager.writeData(file.statusCodes);
  exportManager.flush(file.output);
};
const start = async () => {
  const files = getData();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await testFile(file);
    msg.yellow('Preparing data to be written..');
    file.statusCodes = await getSortedFilteredStatusCodesBasedOnInput(file.data);
    msg.yellow('Data is prepared..');

    exportFileDataToExcel(file);
  }
};

(async function () {
  await start();
})().then(v => {
  msg.green('Finished..');
  setTimeout(process.exit, 20000);
});
