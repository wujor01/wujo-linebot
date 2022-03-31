/* eslint-disable prettier/prettier */
var axios = require('axios');
var MongoClient = require('mongodb').MongoClient;
var groupBy = require('lodash/groupBy');
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
        case 'ds order':
          var fromdate = new Date(dateNow.setHours(0,0,0,0));
          var todate = dateNow.addHours(24);
          var objFilter = {
              $and: [
              {createddate : {$gte : fromdate}},
              {createddate : {$lt : todate}},
              {ispaid : false}
            ]
          };

          var listorder = await MongoFindQuery(objFilter, "order",{});
          var txt = '';
          
          var results = groupBy(listorder, function(n) {
            return n.product;
          });

          console.log(JSON.stringify(results));

          results.forEach(item => {
            txt += `order ${item.length} ${item[0].product.productname} giá bán ${item[0].product.price}\n`
          });
          
          if(txt){
            var totalMoney = listorder.reduce((a,curr) => a + curr.payment, 0);
            txt += `Tiền cần thanh toán: ${totalMoney}`;
            await context.sendText(txt);
          }
          else
            await context.sendText("Không có giao dịch trong ngày cần thanh toán");
  
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
