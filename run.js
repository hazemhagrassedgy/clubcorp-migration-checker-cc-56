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
const msg = require('./msg-helper');

// followRedirects.maxRedirects = 3;
// followRedirects.followRedirects = true;
// followRedirects.trackRedirects = true;

const http = followRedirects.http;
const https = followRedirects.https;

const maxParallelReq = 25;
const args = require("args-parser")(process.argv)

const dataCSVFile = args.data;
if (!dataCSVFile) {
  msg.red('Missing CSV Data File');
  return;
} else {
  msg.yellow('Using data File ' + dataCSVFile);
}

const outputCSVFile = 'output/' + path.basename(dataCSVFile).replace('.csv', '-output.csv');
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
    path: dataCSVFile,
    data: parse(fs.readFileSync(dataCSVFile))
  };
  dataFile.data.shift();
  data.push(dataFile);
  return data;
};

const getURL = (urlStr, done) => {
  //decode URL first to handle already encoded URI
  const options = urlParser.parse(encodeURI(decodeURI(urlStr)));
  options.maxRedirects = 10;
  options.timeout = 30000;
  options.trackRedirects = true;
  options.followRedirects = true;
  
  const protocol = options.protocol === 'https:' ? https : http;
  msg.white('Processing ' + urlStr + ' with ' + options.protocol.replace(':', '') + ' protocol');

  const result = {
    initialURL: urlStr,
    initialStatusCode: 200,
    redirects: [],
    finalURL: '',
    finalStatusCode: 200,
    redirectDetected: false,
    longRedirectDetected: false,
    infiniteRedirectDetected: false,
    httpsMigrated: false,
    clupsNotMigrated: false,
    wwwMigrated: false,
    clubMigrated: false,
    lowerCaseRedirect: false,
    canonicalURL: '',
    valid: false
  };
  options.path = options.pathname;
  const req = protocol.request(options, response => {
    const body = [];
    response.on('data', (chunk) => {
      body.push(chunk);
    });
    response.on('end', () => {
      data = Buffer.concat(body).toString();

      const $ = cheerio.load(data);
      const isSoft404 = $('body').html().toLowerCase().indexOf("can't be found") !== -1 ||
        $('body').html().toLowerCase().indexOf("page not found") !== -1;

      const contentLength = response.headers['content-length'];
      result.canonicalURL = $("link[rel='canonical']").attr('href');
      result.canonicalURL = result.canonicalURL ? result.canonicalURL.replace(/(\r\n|\n|\r)/gm, "") : '';

      result.finalURL = response.responseUrl;
      for (const redirect of response.redirects) {
        result.redirects.push({
          url: redirect.url,
          statusCode: redirect.statusCode
        });
        result.finalURL = redirect.url;
      };
      const finalURLParsed = urlParser.parse(result.finalURL);

      result.redirectDetected = result.redirects.length > 0 ? true : false;
      result.longRedirectDetected = result.redirects.length > 4 ? true : false;
      result.clupsNotMigrated = result.finalURL.indexOf('clup.') !== -1;
      result.wwwMigrated = result.finalURL.indexOf('www.') !== -1;
      result.clubMigrated = result.finalURL.indexOf('/clubs/') !== -1;
      result.httpsMigrated = result.finalURL.indexOf('https:') !== -1;
      result.lowerCaseRedirect = finalURLParsed.pathname === finalURLParsed.pathname.toLocaleLowerCase();

      result.initialStatusCode = result.redirects.length ? result.redirects[0].statusCode : response.statusCode;
      if (response.statusCode === 200 && contentLength !== null && parseInt(contentLength) === 0) {
        result.finalStatusCode = '404o';
      } else if (response.statusCode === 200 && isSoft404) {
        result.finalStatusCode = '404s';
      } else {
        result.finalStatusCode = response.statusCode;
      }
      result.valid = result.httpsMigrated && result.lowerCaseRedirect && result.clubMigrated &&
       result.wwwMigrated && !result.longRedirectDetected && !result.infiniteRedirectDetected && result.canonicalURL !== '';
      done(result);
    });

  }).on('error', err => {
    msg.red(urlStr + ' ' + err.message);
    if(err.message.toLowerCase().indexOf('maximum number of redirects exceeded') !== -1){
      result.infiniteRedirectDetected = true;
      result.longRedirectDetected = true;
      result.redirectDetected = true;
    } else if(err.message.toLowerCase().indexOf('getaddrinfo') !== -1){
      result.finalStatusCode = 404;
    }
    
    done(result);
  });
  req.end();
};

const getURLData = (url, done) => {
  getURL(url[0], (result) => {
    done(result);
  });
};

const testFile = (file, batchDone, done) => {
  const urls = file.data;
  const statusCodes = [];
  const chunks = chunk(file.data, maxParallelReq);
  let progress = 0;

  async.eachSeries(chunks, (chunk, chunkDone) => {
      async.each(chunk, (row, done) => {
        getURLData(row, (redirectsStatusCodes) => {
          statusCodes.push(redirectsStatusCodes);

          progress++;
          msg.blue(progress + '- Progress: %' + (Math.floor(100 * progress / file.data.length)).toFixed(2));

          done();
        });
      }, (err) => {
        batchDone(statusCodes);
        chunkDone(err);
      });
    },
    (err) => {
      done(statusCodes);
    }
  );
};
const getSortedStatusCodesBasedOnInput = (urls, statusCodes) => {
  const sortedStatusCodes = [];
  for (const url of urls) {
    const statusCode = statusCodes.filter((item) => {
      return encodeURI(item.initialURL) === encodeURI(url[0]);
    });

    if (statusCode.length) {
      sortedStatusCodes.push(statusCode[0]);
    }
  }
  return sortedStatusCodes;
};
const exportFileDataToCSV = (file) => {
  const csvData = ['Initial URL, Initial Status Code, Final URL, Final URL Status Code, Redirect Detected, Long Redirect Chain (>3), Infinite Redirect, Not Migrated to WWW (Still using club.), WWW Migrated (www.), Club Migrated (/clubs/), Lower Case Redirects, HTTPS Migrated, Canonical URL, Valid'];
  for (const statusCode of file.statusCodes) {
    let line = statusCode.initialURL + ',' + statusCode.initialStatusCode + ',' + statusCode.finalURL + ',';
    line += statusCode.finalStatusCode + ',';
    line += (statusCode.redirectDetected ? 'Yes' : 'No') + ',';
    line += (statusCode.longRedirectDetected ? 'Yes' : 'No') + ',';
    line += (statusCode.infiniteRedirectDetected ? 'Yes' : 'No') + ',';
    line += (statusCode.clupsNotMigrated ? 'Yes' : 'No') + ',';
    line += (statusCode.wwwMigrated ? 'Yes' : 'No') + ',';
    line += (statusCode.clubMigrated ? 'Yes' : 'No') + ',';
    line += (statusCode.lowerCaseRedirect ? 'Yes' : 'No') + ',';
    line += (statusCode.httpsMigrated ? 'Yes' : 'No') + ',';
    line += statusCode.canonicalURL + ',';
    line += statusCode.valid + ',';

    csvData.push(line);
  }
  fs.writeFileSync(file.output, csvData.join('\n'), 'utf8');
};
const start = (done) => {
  const files = getData();
  async.eachSeries(files, (file, done) => {
      testFile(file, (statusCodes) => {
        file.statusCodes = getSortedStatusCodesBasedOnInput(file.data, statusCodes);
        exportFileDataToCSV(file);
      }, (statusCodes) => {
        file.statusCodes = getSortedStatusCodesBasedOnInput(file.data, statusCodes);
        exportFileDataToCSV(file);
        done();
      })
    },
    (err) => {
      done();
    }
  );
};
start(() => {
  msg.green('Finished..');
});
