/* eslint-disable no-redeclare */
/* eslint-disable prettier/prettier */
var axios = require('axios');
var MongoClient = require('mongodb').MongoClient;
var _ = require('lodash');
var url = process.env.MONGODB_CONNECTION;

//#region Hàm +- ngày tháng
Date.prototype.addHours = function(h) {
  this.setTime(this.getTime() + (h*60*60*1000));
  return this;
}

Date.prototype.addDays = function(days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
}

Date.prototype.addMonths = function (value) {
  var n = this.getDate();
  this.setDate(1);
  this.setMonth(this.getMonth() + value);
  this.setDate(Math.min(n, this.getDaysInMonth()));
  return this;
};

Date.isLeapYear = function (year) { 
  return (((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0)); 
};

Date.getDaysInMonth = function (year, month) {
  return [31, (Date.isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
};

Date.prototype.isLeapYear = function () { 
  return Date.isLeapYear(this.getFullYear()); 
};

Date.prototype.getDaysInMonth = function () { 
  return Date.getDaysInMonth(this.getFullYear(), this.getMonth());
};

Date.prototype.toVNDateString = function () { 
  const yyyy = this.getFullYear();
  let mm = this.getMonth() + 1; // Months start at 0!
  let dd = this.getDate();

  if (dd < 10) dd = '0' + dd;
  if (mm < 10) mm = '0' + mm;

  return dd + '/' + mm + '/' + yyyy;
};
//#endregion

async function MongoInsert(obj, collection = 'message') 
{
  const client = await MongoClient.connect(url, {
    useNewUrlParser: true,
  }).catch((err) => {
    console.log(err);
  });

  if (!client) {
    return;
  }

  try {
    var dbo = client.db('mydb');
    await dbo.collection(collection).insertOne(obj);
    return true;
  } catch (err) {
    console.log(err);
    return false;
  } finally {
    client.close();
  }
}

async function MongoFindQuery(query, collection = 'bubble', fieldsRemove = { _id: 0 }) 
{
  const client = await MongoClient.connect(url, {
    useNewUrlParser: true,
  }).catch((err) => {
    console.log(err);
  });

  if (!client) {
    return;
  }

  try {
    var dbo = client.db('mydb');
    let res = await dbo
      .collection(collection)
      .find(query)
      .project(fieldsRemove)
      .toArray();
    return res;
  } catch (err) {
    console.log(err);
  } finally {
    client.close();
  }
}

async function CallAPILine(method = 'get', url = 'https://api.line.me/v2/bot/profile/Uf072abc9505c04336bb29af8ae9c1a11') 
{
  try {
    var config = {
      method: method,
      url: url,
      headers: {
        Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}`,
      },
    };

    return await axios(config);
  } catch (error) {
    console.log(error);
  }
}

async function GetOrderInDay(dateNow, ispaid, lineid){
  var fromdate = new Date(dateNow.setHours(0,0,0,0));
  var todate = dateNow.addHours(24);
  var objFilter = {
      $and: [
      {createddate : {$gte : fromdate}},
      {createddate : {$lt : todate}},
      {ispaid : ispaid},
      {lineid : lineid}
    ]
  };

  return await MongoFindQuery(objFilter, "order",{});
}

async function GetOrderInMonth(year, month, ispaid, lineid){
  var objFilter = {
      $and: [
      {createddate : {$gte : new Date(year, month, 1)}},
      {createddate : {$lt : new Date(year, month, 1).addMonths(1).addDays(-1)}},
      {ispaid : ispaid},
      {lineid : lineid}
    ]
  };

  console.log(JSON.stringify(objFilter));

  return await MongoFindQuery(objFilter, "order",{});
}


async function ConfirmOrder(dateNow, userid, username, lineid) 
{
  var listorder = await GetOrderInDay(dateNow, false, lineid);
  if(listorder.length == 0)
    return;

  const client = await MongoClient.connect(url, {
    useNewUrlParser: true,
  }).catch((err) => {
    console.log(err);
  });

  if (!client) {
    return;
  }

  try {
    var dbo = client.db('mydb');

    var now = new Date();
    var utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    dateNow = utc.addHours(7);
    var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);;
    var objInsert = {
      user: {
        userid: userid,
        username: username
      },
      orders: listorder,
      totalMoney: totalMoney,
      createddate: dateNow
    };
    await dbo.collection("payment").insertOne(objInsert);
    
    var fromdate = new Date(dateNow.setHours(0,0,0,0));
    var todate = dateNow.addHours(24);

    var myquery = {
      $and: [
      {createddate : {$gte : fromdate}},
      {createddate : {$lt : todate}},
      {ispaid : false}
    ]};

    var newvalues = {$set: {ispaid: true, orderid: objInsert._id} };
    console.log(JSON.stringify(myquery));

    await dbo.collection("order").updateMany(myquery, newvalues);
        
    return totalMoney;
  } catch (err) {
    console.log(err);
    return;
  } finally {
    client.close();
  }
}

module.exports = async function App(context) {
  try {
    if (context.event.isText) {
      var inputText = context.event.text.toLowerCase();
  
      var now = new Date();
      var utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
      var dateNow = utc.addHours(7);
  
      switch (inputText) {
        case 'chào':
          var res = await CallAPILine(
            'get',
            `https://api.line.me/v2/bot/profile/${context.session.user.id}`
          );
          await context.sendText(`Chao xìn ${res.data.displayName}!`);
          break;
        case 'menu':
          var listBundle = await MongoFindQuery({}, 'bubble');
          var bodySend = {
            type: 'carousel',
            contents: listBundle,
          };
  
          await context.sendFlex('Menu', bodySend);
          break;
        case 'order':
          var listorder = await GetOrderInDay(dateNow, false, context.session.id);
          var txt = '';
          
          var results = _.groupBy(listorder, function(n) {
            return n.product._id;
          });
          var listGroup = [];
          Object.keys(results).forEach(key => {
            listGroup.push(results[key]);
          })
          listGroup.forEach(item => {
            txt += `${item.length} ${item[0].product.productname} giá bán ${item[0].product.price.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}\n`
          });
          
          if(txt){
            var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);
            txt += `Tiền cần thanh toán: ${totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`;
            await context.sendText(txt);
          }
          else
            await context.sendText("Không có giao dịch trong ngày cần thanh toán");

          break;
        case 'payment':
          var listorder = await GetOrderInDay(dateNow, false, context.session.id);
          var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);
          await context.sendConfirmTemplate('Thanh toán', {
            type: "confirm",
              actions: [
                {
                  type: "message",
                  label: "Yes",
                  text: "confirm"
                },
                {
                  "type": "message",
                  "label": "No",
                  "text": "No"
                }
              ],
              text: `Thanh toán ${totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`
          });

          break;
        case 'confirm':
          var objUser = await CallAPILine(
            'get',
            `https://api.line.me/v2/bot/profile/${context.session.user.id}`
          );

          var totalMoney = await ConfirmOrder(dateNow, context.session.user.id, objUser.data.displayName, context.session.id);
          if(totalMoney)
            await context.sendText(`${objUser.data.displayName} đã thanh toán ${totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`);
          else
          await context.sendText('Thanh toán không thành công!');

          break;
        case 'order paid':
          var listorder = await GetOrderInDay(dateNow, true, context.session.id);
          var txt = '';
          
          var results = _.groupBy(listorder, function(n) {
            return n.product._id;
          });
          var listGroup = [];
          Object.keys(results).forEach(key => {
            listGroup.push(results[key]);
          })
          listGroup.forEach(item => {
            txt += `${item.length} ${item[0].product.productname} giá bán ${item[0].product.price.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}\n`
          });
          
          if(txt){
            var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);
            txt += `Tiền đã thanh toán: ${totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`;

            var data = await MongoFindQuery({productname: inputText}, "payment",{});
            await context.sendText(txt);
          }
          else
            await context.sendText("Không có giao dịch trong ngày đã thanh toán");

          break;
        default:
          
          //#region ds order theo tháng
          if(inputText.indexOf('order') > -1){
            var yearmonth = inputText.split('order')[1].trim();

            var year = yearmonth.slice(0,4);
            var month = parseInt(yearmonth.slice(4,6)) - 1;

            if(!year || !month){
              await context.sendText(`Năm tháng không đúng định dạng (yyyyMM)!`);
              return;
            }

            var listorder = await GetOrderInMonth(year, month, true, context.session.id);
            var txt = '';

            listorder.forEach(item => {
              txt += `${item.createddate.toVNDateString()}: ${item.user.username} order ${item.product.productname} giá ${item.product.price.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`
            });

            if (!txt) {
              await context.sendText(`Không có order nào trong tháng ${month}-${year}`);
              return;
            }

            txt = `DS order coofee tháng ${month}-${year}\n` + txt;
            var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);
            txt += `Tổng tiền thanh toán: ${totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`;
            await context.sendText(txt);
            return;
          }
          //#endregion

          var data = await MongoFindQuery({productname: inputText}, "product",{});
  
          if (data[0]) {
            var objUser = await CallAPILine(
              'get',
              `https://api.line.me/v2/bot/profile/${context.session.user.id}`
            );
  
            var obj = {
              lineid: context.session.id,
              product: data[0],
              user:{
                _id: context.session.user.id,
                username: objUser.data.displayName,
              },
              quantity: 1,
              payment: data[0].price * 1,
              ispaid: false,
              createddate: dateNow
            };
  
            var isSuccess = await MongoInsert(obj, "order");
  
            if(isSuccess)
              await context.sendText(`Order ${inputText} thành công, tiền cần thanh toán ${obj.payment}đ`);
            else
            await context.sendText(`Lỗi xử lý!`);
          }else{
            await context.sendText(`Nói gì zậy?`);
          }
  
          break;
      }
    }
  } catch (error) {
    console.log(error);
  }
};
