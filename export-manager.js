const excel = require('excel4node'),
  fs = require('fs'),
  msg = require('./msg-helper');
let workbooks;
let worksheets = {};
let style = null;

module.exports.init = () => {
  msg.yellow('Initiating excel file creation');
  workbooks = {
    main: new excel.Workbook(),
    notOnHTTPS: new excel.Workbook(),
    notWWW: new excel.Workbook(),
    notClubsMigrated: new excel.Workbook(),
    urls400s: new excel.Workbook(),
    urls500s: new excel.Workbook(),
    redirectURLs: new excel.Workbook(),
    irURLs: new excel.Workbook(),
    lrURLs: new excel.Workbook(),
    flcURLs: new excel.Workbook(),
    noCanonicalURLs: new excel.Workbook()
  }

  // Add Worksheets to the workbooks
  worksheets = {
    summary: workbooks.main.addWorksheet('Summary'),
    allURLs: workbooks.main.addWorksheet('All URLs'),
    htmlURLs: workbooks.main.addWorksheet('HTML URLs'),
    vanityURLs: workbooks.main.addWorksheet('Vanity URLs'),
    notOnHTTPS: workbooks.notOnHTTPS.addWorksheet('Not HTTPS'),
    notWWW: workbooks.notWWW.addWorksheet('Not WWW'),
    notClubsMigrated: workbooks.notClubsMigrated.addWorksheet('Not Clubs Migrated'),
    urls400s: {
      all: workbooks.urls400s.addWorksheet('400s HTML URLs')
    },
    urls500s: workbooks.urls500s.addWorksheet('500s HTML URLs'),
    redirectURLs: workbooks.redirectURLs.addWorksheet('Redirects'),
    irURLs: workbooks.irURLs.addWorksheet('Infinite Redirects'),
    lrURLs: workbooks.lrURLs.addWorksheet('Long Redirects Chain'),
    flcURLs: workbooks.flcURLs.addWorksheet('Failing Lower Case Redirect'),
    noCanonicalURLs: workbooks.noCanonicalURLs.addWorksheet('No Canonical')
  };

  style = workbooks.main.createStyle({
    font: {
      color: '#000000',
      size: 12,
      bold: true
    }
  });

  worksheets.summary.cell(3, 1).string('# URLs').style(style);
  worksheets.summary.cell(4, 1).string('# Vanity URLs').style(style);
  worksheets.summary.cell(5, 1).string('# 400s URLs').style(style);
  worksheets.summary.cell(6, 1).string('# 500s URLs').style(style);
  worksheets.summary.cell(7, 1).string('# Redirects URLs').style(style);
  worksheets.summary.cell(8, 1).string('# Long Redirects Chain URLs').style(style);
  worksheets.summary.cell(9, 1).string('# Infinite Redirects URLs').style(style);
  worksheets.summary.cell(10, 1).string('# Not HTTPS URLs').style(style);
  worksheets.summary.cell(11, 1).string('# Not WWW Migrated URLs').style(style);
  worksheets.summary.cell(12, 1).string('# Not Lower Case URLs').style(style);
  worksheets.summary.cell(13, 1).string('# URLs Without Canonical').style(style);
  worksheets.summary.cell(14, 1).string('# Not Migrated to /clubs').style(style);
};
const writeHeadersToWorksheet = (worksheet) => {
  const headers = ['URL', 'Initial Status Code', 'Final URL', 'Final URL Status Code',
    'Type', 'Redirect Detected', 'Long Redirect Chain (>3)', 'Infinite Redirect',
    'Still using club.', 'WWW Migrated (www.)', 'Club Migrated (/clubs/)',
    'Lower Case Redirects', 'HTTPS Migrated', 'Canonical URL', 'Valid', 'Page'];

  for (let i = 1; i <= headers.length; i++) {
    worksheet.cell(1, i).string(headers[i - 1]).style(style);
  }
}
const writeHeaders = (worksheets) => {
  for (const key in worksheets) {
    const worksheet = worksheets[key];

    if (key === 'summary') {
      continue;
    } else if (key === 'urls400s') {
      writeHeaders(worksheet);
    } else {
      writeHeadersToWorksheet(worksheet)
    }

  }
}
const writeDataToWorksheet = (worksheet, rows) => {

  for (const [index, statusCode] of rows.entries()) {
    const rowNum = index + 2;
    worksheet.cell(rowNum, 1).string(statusCode.url.url);
    worksheet.cell(rowNum, 2).string(statusCode.redirects[0].status);
    worksheet.cell(rowNum, 3).string(statusCode.redirects[statusCode.redirects.length - 1].url);
    worksheet.cell(rowNum, 4).string(statusCode.redirects[statusCode.redirects.length - 1].status);
    worksheet.cell(rowNum, 5).string(statusCode.type);
    worksheet.cell(rowNum, 6).string((statusCode.redirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 7).string((statusCode.longRedirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 8).string((statusCode.infiniteRedirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 9).string((statusCode.clupsNotMigrated ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 10).string((statusCode.wwwMigrated ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 11).string((statusCode.clubMigrated ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 12).string((statusCode.lowerCaseRedirect ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 13).string((statusCode.onHTTPS ? 'Yes' : 'No'));
    worksheet.cell(rowNum, 14).string(statusCode.meta.canonical);
    worksheet.cell(rowNum, 15).string(statusCode.valid ? 'Yes' : 'No');
    worksheet.cell(rowNum, 16).string(statusCode.page ? statusCode.page.page : '');
  }
}
module.exports.writeData = (rows) => {
  //Restructure the data array
  const data = [];
  for (const row of rows) {
    for (const [index, col] of row.entries()) {
      data[index] = data[index] ? data[index] : [];
      data[index].push(col);
    }
  }

  msg.yellow('Writing data to the excel file');
  const urls = [];
  for (const [index, audit] of data.entries()) {
    urls[index] = urls[index] ? urls[index] : {};

    urls[index].all = data[index];
    urls[index].htmlURLs = audit.filter((statusCode) => {
      return statusCode.type === 'HTML';
    });
    urls[index].vanityURLs = urls[index].htmlURLs.filter((statusCode) => {
      return statusCode.category === 'vanity';
    });
    urls[index].urls400s = urls[index].htmlURLs.filter((statusCode) => {
      // Page should be always in the www.clubcorp.com
      // Final URL with 400s status detected

      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];

      let result = ((lastRedirect.status >= 400 && lastRedirect.status <= 410) ||
        lastRedirect.status === '404s' || lastRedirect.status === '404o');
      result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);

      return result;
    });
    urls[index].urls400sClusters = {};
    for (const statusCode of urls[index].urls400s) {
      const url = statusCode.url;
      if (!urls[index].urls400sClusters[url.cluster]) {
        urls[index].urls400sClusters[url.cluster] = [];

        if (index === 0) {
          worksheets.urls400s[url.cluster] = workbooks.urls400s.addWorksheet(url.cluster);
        }
      }
      urls[index].urls400sClusters[url.cluster].push(statusCode);
    }

    urls[index].urls500s = urls[index].htmlURLs.filter((statusCode) => {
      // Page should be always in the www.clubcorp.com
      // Server Error detected

      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];
      
      let result = (lastRedirect.status >= 500 && lastRedirect.status <= 510);
      result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);
      return result;
    });
    urls[index].redirectURLs = urls[index].htmlURLs.filter((statusCode) => {
      // URL must be in the club.clubcorp.com or www.clubcorp.com domain
      // Page should be always in the www.clubcorp.com
      // Status code is 3xx or 5xx
      // Final URL must be in *.clubcorp.com domain
      // Redirect detected
      const firstRedirect = statusCode.redirects[0];
      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];

      let result = (statusCode.url.url.isClubCorpClubHost() || statusCode.url.url.isClubCorpWWWHost()) &&
        ((firstRedirect.status >= 500 && firstRedirect.status <= 510) ||
        (firstRedirect.status >= 300 && firstRedirect.status <= 310));

      result = result && statusCode.redirect && lastRedirect.url.isClubCorpHost();
      result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);

      return result;
    });
    urls[index].lrURLs = urls[index].htmlURLs.filter((statusCode) => {
       // Page should be always in the www.clubcorp.com
       // Long redirect detected

       let result = statusCode.longRedirect;
       result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);

      return statusCode.longRedirect;
    });
    urls[index].irURLs = urls[index].htmlURLs.filter((statusCode) => {
       // Page should be always in the www.clubcorp.com
      // Infine redirect detected

       let result = statusCode.infiniteRedirect;
       result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);

      return result;
    });
    urls[index].notOnHTTPS = urls[index].htmlURLs.filter((statusCode) => {
      // URL and the Final URL must be in the club.clubcorp.com or www.clubcorp.com domain
      // Page should be always in the www.clubcorp.com
      // Status code should be always 200
      // Final URL is not on HTTPS


      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];
      let result = !statusCode.onHTTPS && 
        (statusCode.url.url.isClubCorpClubHost() || statusCode.url.url.isClubCorpWWWHost()) &&
        (lastRedirect.url.isClubCorpClubHost() || lastRedirect.url.isClubCorpWWWHost()) &&
        lastRedirect.status == 200;
      result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);

      return result;
    });
    urls[index].notWWW = urls[index].htmlURLs.filter((statusCode) => {
      // URL and the Final URL must be in the club.clubcorp.com domain
      // Page should be always in the www.clubcorp.com
      // Status code should be always 200

      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];
      let result = !statusCode.wwwMigrated && statusCode.url.url.isClubCorpClubHost() &&
        lastRedirect.url.isClubCorpClubHost() &&
        lastRedirect.status == 200;
      result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);
      
      return result;
    });
    urls[index].flcURLs = urls[index].htmlURLs.filter((statusCode) => {
       // URL and the Final URL must be in the club.clubcorp.com or www.clubcorp.com domain
      // Page should be always in the www.clubcorp.com
      // Status code should be always 200
      // Final URL has capital letters

      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];
      let result = !statusCode.lowerCaseRedirect && 
        (statusCode.url.url.isClubCorpClubHost() || statusCode.url.url.isClubCorpWWWHost()) &&
        (lastRedirect.url.isClubCorpClubHost() || lastRedirect.url.isClubCorpWWWHost()) &&
        lastRedirect.status == 200;
      result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);

      return result;
    });
    urls[index].noCanonicalURLs = urls[index].htmlURLs.filter((statusCode) => {
      // URL and the Final URL must be in the club.clubcorp.com or www.clubcorp.com domain
      // Page should be always in the www.clubcorp.com
      // Status code should be always 200
      // Final URL has no canonical

      const lastRedirect = statusCode.redirects[statusCode.redirects.length - 1];
      let result = statusCode.meta.canonical === ''  && 
        (statusCode.url.url.isClubCorpClubHost() || statusCode.url.url.isClubCorpWWWHost()) &&
        (lastRedirect.url.isClubCorpClubHost() || lastRedirect.url.isClubCorpWWWHost()) &&
        lastRedirect.status == 200;
      result = result && (statusCode.page !== '' ? statusCode.page.page.isClubCorpWWWHost() : true);

      return result;
    });
    urls[index].notClubsMigrated = urls[index].htmlURLs.filter((statusCode) => {
      const firstRedirect = statusCode.redirects[0].url;
      const finalURL = statusCode.redirects[statusCode.redirects.length - 1].url;

      return !statusCode.clubMigrated;
    });
  }

  writeHeaders(worksheets);

  //Update the summary tab
  for (const [index, audit] of data.entries()) {
    const colIndex = index + 2;
    worksheets.summary.cell(1, colIndex).date(new Date(urls[index].htmlURLs[0].created)).style(style);
    // worksheets.summary.cell(2, colIndex).number(urls[index].all.length);
    worksheets.summary.cell(3, colIndex).number(urls[index].htmlURLs.length);
    worksheets.summary.cell(4, colIndex).number(urls[index].vanityURLs.length);
    worksheets.summary.cell(5, colIndex).number(urls[index].urls400s.length);
    worksheets.summary.cell(6, colIndex).number(urls[index].urls500s.length);
    worksheets.summary.cell(7, colIndex).number(urls[index].redirectURLs.length);
    worksheets.summary.cell(8, colIndex).number(urls[index].lrURLs.length);
    worksheets.summary.cell(9, colIndex).number(urls[index].irURLs.length);
    worksheets.summary.cell(10, colIndex).number(urls[index].notOnHTTPS.length);
    worksheets.summary.cell(11, colIndex).number(urls[index].notWWW.length);
    worksheets.summary.cell(12, colIndex).number(urls[index].flcURLs.length);
    worksheets.summary.cell(13, colIndex).number(urls[index].noCanonicalURLs.length);
    worksheets.summary.cell(14, colIndex).number(urls[index].notClubsMigrated.length);
  }


  //Update other worksheets
  writeDataToWorksheet(worksheets.allURLs, urls[0].all);
  writeDataToWorksheet(worksheets.htmlURLs, urls[0].htmlURLs);
  writeDataToWorksheet(worksheets.vanityURLs, urls[0].vanityURLs);
  writeDataToWorksheet(worksheets.urls400s.all, urls[0].urls400s);
  for (const clusterKey in urls[0].urls400sClusters) {
    writeDataToWorksheet(worksheets.urls400s[clusterKey], urls[0].urls400sClusters[clusterKey]);
  }
  writeDataToWorksheet(worksheets.urls500s, urls[0].urls500s);
  writeDataToWorksheet(worksheets.redirectURLs, urls[0].redirectURLs);
  writeDataToWorksheet(worksheets.lrURLs, urls[0].lrURLs);
  writeDataToWorksheet(worksheets.irURLs, urls[0].irURLs);
  writeDataToWorksheet(worksheets.notOnHTTPS, urls[0].notOnHTTPS);
  writeDataToWorksheet(worksheets.notWWW, urls[0].notWWW);
  writeDataToWorksheet(worksheets.flcURLs, urls[0].flcURLs);
  writeDataToWorksheet(worksheets.noCanonicalURLs, urls[0].noCanonicalURLs);
  writeDataToWorksheet(worksheets.notClubsMigrated, urls[0].notClubsMigrated);
};

module.exports.flush = (path) => {
  const d = new Date();
  const mainDate = (d.getMonth() + 1) + '-' + d.getDate() + '-' + d.getFullYear();
  const fileSuffix = 'Audit-' + mainDate + '.xlsx';
  const mainFolder = path + mainDate + '/';
  if (!fs.existsSync(mainFolder)) {
    fs.mkdirSync(mainFolder, { recursive: true });
  }
  workbooks.main.write(mainFolder + 'Summary ' + fileSuffix);
  workbooks.urls400s.write(mainFolder + '400s URLs ' + fileSuffix);
  workbooks.urls500s.write(mainFolder + '500 URLs ' + fileSuffix);
  workbooks.redirectURLs.write(mainFolder + 'Redirects ' + fileSuffix);
  workbooks.lrURLs.write(mainFolder + 'Long Redirects ' + fileSuffix);
  workbooks.irURLs.write(mainFolder + 'Infinite Redirects ' + fileSuffix);
  workbooks.notOnHTTPS.write(mainFolder + 'HTTPS ' + fileSuffix);
  workbooks.notWWW.write(mainFolder + 'WWW ' + fileSuffix);
  workbooks.flcURLs.write(mainFolder + 'Failing Lower Case Redirect ' + fileSuffix);
  workbooks.noCanonicalURLs.write(mainFolder + 'Without Canonical ' + fileSuffix);
  workbooks.notClubsMigrated.write(mainFolder + 'Not Migrated to Clubs ' + fileSuffix);
  msg.green('Excel files were created successfully: ' + mainFolder);
};
