/* eslint-disable no-redeclare */
/* eslint-disable prettier/prettier */
var MongoClient = require('mongodb').MongoClient;
var _ = require('lodash');
var url = 'mongodb+srv://wujor14:8PdCj1bwZoFRUIYc@cluster0.jdltp.mongodb.net/';

var cloudinary = require('cloudinary').v2;

cloudinary.config({ 
    cloud_name: 'wujo', 
    api_key: '163757859422761', 
    api_secret: process.env.CLOUDINARYTOKEN 
  });

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

async function GetTopPayment(year, month) {
  month = parseInt(month) - 1;//js 0 là tháng 1

  var objFilter = {
      $and: [
      {createddate : {$gte : new Date(year, month, 1)}},
      {createddate : {$lt : new Date(year, month, 1).addMonths(1)}}
    ]
  };

  var listData = await MongoFindQuery(objFilter, "payment",{});

  if (listData.length == 0) {
    return listData;
  }

  var lstGroupByUser = _.chain(listData).groupBy("user.userid").map((value, key) => ({ userid: key, payments: value })).value();

  lstGroupByUser.forEach(x => {
    x.totalMoney = 0;
    x.username = x.payments[0].user.username;
    x.payments.forEach(payment => {
      x.totalMoney += payment.totalMoney;
    });
  });

  if (lstGroupByUser.length > 0) {
    objFilter = {
      $and: [
      {createddate : {$gte : new Date(year, month, 1)}},
      {createddate : {$lt : new Date(year, month, 1).addMonths(1)}},
      {ispaid : true}
    ]
  };
    var listOrder = await MongoFindQuery(objFilter, "order",{});

    var listUser = [];

    lstGroupByUser.forEach(item => {
      item.totalMoneyMyOrder = listOrder.filter(x => x.user.id == item.userid).reduce((a,curr) => a + curr.payment, 0);

      listUser.push({
        userid: item.userid,
        username : item.username,
        totalMoney : item.totalMoney,
        totalMoneyMyOrder: item.totalMoneyMyOrder,
        total: item.totalMoneyMyOrder - item.totalMoney,
        orders: listOrder.filter(x => x.user.id == item.userid)
      });
    });
  }

  var listOrderByUserNotPayment = listOrder.filter(order => listUser.map(user => user.userid).findIndex(x => x == order.user.id) == -1);

  var listGroupByUserNotPayment = _.chain(listOrderByUserNotPayment).groupBy("user.id").map((value, key) => ({ userid: key, orders: value })).value();
  
  listGroupByUserNotPayment.forEach(item => {
    item.username = item.orders[0].user.username;
    item.totalMoney = 0;
    item.totalMoneyMyOrder = 0;
    item.orders.forEach(order => {
      item.totalMoneyMyOrder += order.payment;
    });

    listUser.push({
      userid: item.userid,
      username : item.username,
      totalMoney : item.totalMoney,
      totalMoneyMyOrder: item.totalMoneyMyOrder,
      total: item.totalMoneyMyOrder - item.totalMoney,
      orders: item.orders
    }); 
  });

  return _.orderBy(listUser, ['total'], ['desc']);
}

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

async function InitDataFirstMonth(year, month){
  var dateLastMonth = new Date(year, month);
  dateLastMonth.addMonths(-1);
  //tháng trước 
  var lastMonth = dateLastMonth.getMonth() + 1;
  var listDataLastMonth = await GetTopPayment(year, lastMonth);

  //#region Xử lý chung transaction
  const client = await MongoClient.connect(url, {
    useNewUrlParser: true,
  }).catch((err) => {
    console.log(err);
  });

  if (!client) {
    return;
  }

  const paymentsCollection = client.db('mydb').collection('payment');
  const session = client.startSession();

  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };

  try {

    var now = new Date();
    var utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    var dateNow = utc.addHours(7);

    const transactionResults = await session.withTransaction(async () => {
          for (let i = 0; i < listDataLastMonth.length; i++) {
            var item = listDataLastMonth[i];
            var objInsert = {
              user: {
                userid: item.userid,
                username: item.username
              },
              orders: [],
              totalMoney: -item.total,
              createddate: dateNow
            };

            await paymentsCollection.insertOne(objInsert, { session });
          }
        }, transactionOptions);

      if (transactionResults) {
        console.log('The reservation was successfully created.');
        return "true";
      } else {
        console.log('The transaction was intentionally aborted.');
        return "The transaction was intentionally aborted.";
      };
  } catch (err) {
    console.log(err);
    return JSON.stringify(err);
  } finally {
    await session.endSession();
  }
  //#endregion

}
InitDataFirstMonth(2022,6);
