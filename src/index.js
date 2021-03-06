/* eslint-disable no-redeclare */
/* eslint-disable prettier/prettier */
var axios = require('axios');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;
var _ = require('lodash');
var url = process.env.MONGODB_CONNECTION;

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
var cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

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

async function MongoUpdate(query, newvalues, database) 
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
    var dbo = client.db(database);
    if(query._id){
      var query = { _id: new ObjectId(query._id) };
      await dbo.collection("mydb").updateOne(query, {$set: newvalues });
    }
    else
      await dbo.collection("mydb").updateMany(query, {$set: newvalues });

    return true;
  } catch (err) {
    console.log(err);
    return false;
  } finally {
    client.close();
  }
}

async function MongoDelete(query, collection) 
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
    var dbo = client.db("mydb");
    const result = await dbo.collection(collection).deleteMany(query);
    return result.deletedCount;
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

async function CallAPILine(method = 'get', url = '') 
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
  } catch (err) {
    console.log(err);
  }
}

async function GetOrderInDay(dateNow, ispaid, lineid){
  var fromdate = new Date(dateNow.setHours(0,0,0,0));
  var todate = dateNow.addHours(24);
  var objFilter = {
      $and: [
      {createddate : {$gte : fromdate}},
      {createddate : {$lt : todate}},
      {ispaid : ispaid}
      //Không lấy điều kiện lineid nữa vì chưa tìm được cách add rich menu vào group
      //{lineid : lineid}
    ]
  };

  return await MongoFindQuery(objFilter, "order",{});
}

async function GetOrderInMonth(year, month, ispaid, lineid){
  month = parseInt(month) - 1;//js 0 là tháng 1

  var objFilter = {
      $and: [
      {createddate : {$gte : new Date(year, month, 1)}},
      {createddate : {$lt : new Date(year, month, 1).addMonths(1)}},
      {ispaid : ispaid}
      //Không lấy điều kiện lineid nữa vì chưa tìm được cách add rich menu vào group
      //{lineid : lineid}
    ]
  };

  return await MongoFindQuery(objFilter, "order",{});
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

    await dbo.collection("order").updateMany(myquery, newvalues);
        
    return totalMoney;
  } catch (err) {
    console.log(err);
    return;
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

//#region Chart
const width = 1500;
const height = 1200; 
const backgroundColour = 'white';
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width,
  height,
  backgroundColour,
});

let streamUpload = (fileBuffer) => {
    // eslint-disable-next-line no-undef
    return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream(
          (error, result) => {
            if (result) {
              resolve(result);
            } else {
              reject(error);
            }
          }
        );

      streamifier.createReadStream(fileBuffer).pipe(stream);
    });
};

async function GetLinkChart(topPayment, _label = 'Bảng xếp hạng Máy chủ BHX-Sale'){
  var config = {
    type: 'bar',
    data: {
        labels: topPayment.map(x => x.username),
        datasets: [{
            label: _label,
            data: topPayment.map(x => x.total),
            backgroundColor: [
                'rgba(255, 99, 132, 0.2)',
                'rgba(54, 162, 235, 0.2)',
                'rgba(255, 206, 86, 0.2)',
                'rgba(75, 192, 192, 0.2)',
                'rgba(153, 102, 255, 0.2)',
                'rgba(255, 159, 64, 0.2)'
            ],
            borderColor: [
                'rgba(255, 99, 132, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)',
                'rgba(255, 159, 64, 1)'
            ],
            borderWidth: 1
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
  };

  const dataBuffer = await chartJSNodeCanvas.renderToBufferSync(config);
  let result = await streamUpload(dataBuffer);
  return result.secure_url;
}
//#endregion

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
          await context.sendSticker({
            packageId: "11537",
            stickerId: "52002738"
          });
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
            txt += `${item.length} ${item[0].product.productname} giá bán ${item[0].product.price.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})} (${item.map(x => x.user.username).join()})\n`
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
          if(totalMoney == 0){
            await context.sendText('Không có order nào trong ngày hôm nay cần thanh toán');
            return;
          }

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
        case 'cancel':
          var fromdate = new Date(dateNow.setHours(0,0,0,0));
          var todate = dateNow.addHours(24);
          var query = {
            $and: [
            {createddate : {$gte : fromdate}},
            {createddate : {$lt : todate}},
            {ispaid : false},
            //Không lấy điều kiện lineid nữa vì chưa tìm được cách add rich menu vào group
            //{lineid : context.session.id},
            {"user.id" : context.session.user.id}
          ]
          };

          var numOrder = await MongoDelete(query, "order");

          await context.sendSticker({
            packageId: "11538",
            stickerId: "51626530"
          });

          if(numOrder == 0)
            await context.sendText('Bạn chưa có order nào trong ngày hôm nay chưa thanh toán');
          else
            await context.sendText(`Hủy thành công ${numOrder} order của bạn trong ngày hôm nay`);

          break;
        case 'help':
          var txt = "--Danh sách lệnh--\n";
          txt+= "'menu': Menu gọi đồ uống\n";
          txt+= "'order': DS order trong ngày chưa thanh toán\n";
          txt+= "'payment': Thanh toán các order trong ngày\n";
          txt+= "'order paid': DS order trong ngày đã thanh toán\n";
          txt+= "'cancel': Hủy order của bản thân\n";
          txt+= "'order {yyyyMM}': DS order trong tháng đã thanh toán\n";
          txt+= "'payment {yyyyMM}': DS người thanh toán trong tháng đã thanh toán\n";

          await context.sendText(txt);
          break;
        case 'chart':
          var urlChart = await GetLinkChart();
          await context.sendImage({
            originalContentUrl: urlChart,
            previewImageUrl: urlChart,
          });
          break;
        default:
          
          //#region ds order theo tháng
          if(inputText.indexOf('order') > -1){
            var yearmonth = inputText.split('order')[1].trim();

            var year = '';
            var month = '';

            if (yearmonth == 'month') {
              year = new Date().getFullYear();
              month = '0' + (new Date().getMonth() + 1);
            }else{
              year = yearmonth.slice(0,4);
              month = yearmonth.slice(4,6);
            }

            if(!year || !month){
              await context.sendText(`Năm tháng không đúng định dạng (yyyyMM)!`);
              return;
            }

            var listorder = await GetOrderInMonth(year, month, true, context.session.id);
            var txt = '';

            listorder.forEach(item => {
              txt += `${item.createddate.toVNDateString()}: ${item.user.username} order ${item.product.productname} giá ${item.product.price.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}\n`
            });

            if (!txt) {
              await context.sendText(`Không có order nào trong tháng ${month}-${year}`);
              return;
            }

            txt = `DS order coffee tháng ${month}-${year}\n` + txt;
            var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);
            txt += `Tổng tiền thanh toán: ${totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`;
            await context.sendText(txt);
            return;
          }
          //#endregion

          //#region top thanh toán
          if(inputText.indexOf('payment') > -1){
            var yearmonth = inputText.split('payment')[1].trim();
  
            var year = '';
            var month = '';
  
            if (yearmonth == 'month') {
              year = new Date().getFullYear();
              month = '0' + (new Date().getMonth() + 1);
            }else{
              year = yearmonth.slice(0,4);
              month = yearmonth.slice(4,6);
            }
  
            if(!year || !month){
              await context.sendText(`Năm tháng không đúng định dạng (yyyyMM)!`);
              return;
            }

            let txt = '';
            var lstData = await GetTopPayment(year, month);
            if (lstData.length == 0) {
              //Nếu gọi không có dữ liệu của tháng hiện tại => Chưa init dữ liệu của tháng trước cho tháng này => Đi init
              if (yearmonth == 'month') {
                var message = await InitDataFirstMonth(year, month);
                if (message == 'true') {
                  //Init thành công thì gọi lại hàm lấy thông tin payment trong tháng
                  lstData = await GetTopPayment(year, month);
                }else{
                  await context.sendText(`Lỗi lấy thông tin dữ liệu đầu tháng: ${message}`);
                  return;
                }
              }else{
                await context.sendText(`Không có thông tin danh sách thanh toán của tháng ${month} - ${year}`);
                return;
              }
            }

            // lstData.forEach(item =>{
            //   txt += `${item.username} đã thanh toán ${item.totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})} (cá nhân ${item.totalMoneyMyOrder.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})})\n`;
            // });

            // await context.sendText(txt);

            var urlChart = await GetLinkChart(lstData);
            await context.sendImage({
              originalContentUrl: urlChart,
              previewImageUrl: urlChart,
            });

            // var datenow = new Date();

            // //Ngày đầu tháng trả về thêm thông tin chi tiêu tháng vừa qua
            // if (datenow.getDate() === 1 || datenow.getDate() === 2) {
            //   var lstDataOrderByMyOrder = _.orderBy(lstData, ['totalMoneyMyOrder'], ['desc']);

            //   txt = '--TỔNG TIỀN THÁNG TRƯỚC--\n';
            //   lstDataOrderByMyOrder.forEach(item =>{
            //     txt += `${item.username} đã order hết ${item.totalMoneyMyOrder.toLocaleString('vi-VN',{style:     'currency', currency: 'VND'})}\n`;
            //   });

            //   txt+= `-----------------------\n`

            //   txt+= `Tổng: ${_.sumBy(lstDataOrderByMyOrder, 'totalMoneyMyOrder').toLocaleString('vi-VN',{style:     'currency', currency: 'VND'})}\n`

            //   await context.sendText(txt);
            // }

            return;
          }
          //#endregion

          var data = await MongoFindQuery({productname: inputText}, "product",{});
  
          //Order theo productname
          if (data[0]) {
            var objUser = await CallAPILine(
              'get',
              `https://api.line.me/v2/bot/profile/${context.session.user.id}`
            );
  
            var obj = {
              lineid: context.session.id,
              product: data[0],
              user:{
                id: context.session.user.id,
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
            //await context.sendText(`Nói gì zậy?`);
          }
  
          break;
      }
    }
  } catch (err) {
    console.log(err);
  }
};
