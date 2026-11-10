const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2],port=+process.argv[3];
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.ico':'image/x-icon','.png':'image/png','.ttf':'font/ttf'};
http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));
 if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');
 res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(port);
