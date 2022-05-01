server.get('/send-id', (req, res) => {
    res.json({ id: process.env.LINE_LIFF_ID });
  });
  
  server.get('/liff', (req, res) => {
    const filename = path.join(`${__dirname}/liff.html`);
    res.sendFile(filename);
  });