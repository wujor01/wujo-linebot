/* eslint-disable no-redeclare */
/* eslint-disable prettier/prettier */
var axios = require('axios');
var MongoClient = require('mongodb').MongoClient;
var _ = require('lodash');
var url = process.env.MONGODB_CONNECTION;

Date.prototype.addHours = function(h) {
  this.setTime(this.getTime() + (h*60*60*1000));
  return this;
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

async function GetOrderInDay(dateNow){
  var fromdate = new Date(dateNow.setHours(0,0,0,0));
  var todate = dateNow.addHours(24);
  var objFilter = {
      $and: [
      {createddate : {$gte : fromdate}},
      {createddate : {$lt : todate}},
      {ispaid : false}
    ]
  };

  return await MongoFindQuery(objFilter, "order",{});
}

async function ConfirmOrder(dateNow, userid, username) 
{
  var listorder = await GetOrderInDay(dateNow);
  if(listorder.length == 0)
    return;

  var fromdate = new Date(dateNow.setHours(0,0,0,0));
  var todate = dateNow.addHours(24);

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
    var myquery = {
      $and: [
      {createddate : {$gte : fromdate}},
      {createddate : {$lt : todate}},
      {ispaid : false}
    ]};
    var newvalues = {$set: {ispaid: true} };

    await dbo.collection("order").updateMany(myquery, newvalues);

    var now = new Date();
    var utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);

    await dbo.collection("payment").insertOne({
      user: {
        userid: userid,
        username: username
      },
      orders: listorder,
      totalMoney: totalMoney,
      createddate: utc.addHours(7)
    });
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
          var listorder = await GetOrderInDay(dateNow);
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
          var listorder = await GetOrderInDay(dateNow);
          var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);
          await context.sendConfirmTemplate('Thanh toán order', {
            type: "confirm",
              actions: [
                {
                  type: "message",
                  label: "Yes",
                  text: "cofirm order"
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
        case 'cofirm order':
          var objUser = await CallAPILine(
            'get',
            `https://api.line.me/v2/bot/profile/${context.session.user.id}`
          );

          var result = await ConfirmOrder(dateNow, context.session.user.id, objUser.data.displayName);
          if(result)
            await context.sendText(`${objUser.data.displayName} đã thanh toán ${totalMoney.toLocaleString('vi-VN',{style: 'currency', currency: 'VND'})}`);
          else
          await context.sendText('Thanh toán không thành công!');
          
          break;
        default:
          var data = await MongoFindQuery({productname: inputText}, "product",{});
  
          if (data[0]) {
            var objUser = await CallAPILine(
              'get',
              `https://api.line.me/v2/bot/profile/${context.session.user.id}`
            );
  
            var obj = {
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
