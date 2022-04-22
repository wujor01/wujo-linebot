/* eslint-disable prettier/prettier */
const fs = require('fs');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
var cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({ 
    cloud_name: 'wujo', 
    api_key: '163757859422761', 
    api_secret: 'OJOR2Zvx6_2MkwjRW2alGVy83Xk' 
  });

const width = 2000;
const height = 2000; 
const backgroundColour = 'white';
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width,
  height,
  backgroundColour,
});

var config = {
    type: 'bar',
    data: {
        labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
        datasets: [{
            label: '# of Votes',
            data: [12, 19, 3, 5, 2, 3],
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

let streamUpload = (fileBuffer) => {
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

async function run() {
  console.log('run');
  const dataUrl = await chartJSNodeCanvas.renderToDataURL(config);
  const base64Image = dataUrl;

  //const dataBuffer = await chartJSNodeCanvas.renderToBufferSync(configuration);
  //let result = await streamUpload(dataBuffer);
  //console.log(result);

  var base64Data = base64Image.replace(/^data:image\/png;base64,/, '');

  fs.writeFile('out.png', base64Data, 'base64', function (err) {
    if (err) {
      console.log(err);
    }
  });
  return dataUrl;
}

run();
