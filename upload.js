
var http = require('http'),
    util = require('util'),
 	fs = require('fs'),
    formidable = require('formidable'),
    knox = require('knox'),
    server;

var TEST_PORT = process.env.PORT || 3003;	
var TEST_TMP = "/tmp";

var s3Client = knox.createClient({
    key: 'AKIAIIZEL3OLHCBIZBBQ'
  , secret: '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'
  , bucket: 'com.picbounce.incoming'
});


function upload_complete(res,fields){
		console.log('-> save done');
		var stream = fs.createReadStream(TEST_TMP+"/test.mov");
		s3Client.putStream(stream, '/test.mov', function(err, result){
		  	console.log("put to s3!")
	        res.writeHead(200, {'content-type': 'text/plain'});
	        res.write('received fields:\n\n '+util.inspect(fields));
	        res.write('\n\n');
	        res.end();
		});
		console.log("done")
}


server = http.createServer(function(req, res) {
  if (req.url == '/') {
	console.log("works!")
    res.writeHead(200, {'content-type': 'text/html'});
    res.end(
      '<form action="/upload" enctype="multipart/form-data" method="post">'+
      '<input type="text" name="key"><br>'+
      '<input type="file" name="upload" multiple="multiple"><br>'+
      '<input type="submit" value="Upload">'+
      '</form>'
    );

  } else if (req.url == '/upload') {
    var form = new formidable.IncomingForm(),
        files = [],
        fields = [];

    form.uploadDir = TEST_TMP;
	fileStream = fs.createWriteStream(TEST_TMP+"/test.mov")
	
    // Add error handler
    fileStream.addListener("error", function(err) {
        console.log("Got error while writing to file '" + fileName + "': ", err);
    });

    // Add drain (all queued data written) handler to resume receiving request data
    fileStream.addListener("drain", function() {
        req.resume();
    });

    form
	  .on('field', function(field, value) {
        console.log(field, value);
        fields.push([field, value]);
      })
   
      .on('end', function() {
        console.log('-> upload done');
		fileStream.addListener("drain", function() {
		            // Close file stream
		            fileStream.end();
		            // Handle request completion, as all chunks were already written
		            upload_complete(res,fields);
		
		
			
		   });
		
	
      });


	form.onPart = function(part) {
  		if (!part.filename) {
    		// let formidable handle all non-file parts
    		form.handlePart(part);
  		}else{
			part.addListener('data', function(data) {
			    console.log(part.filename);
				console.log(data);
				// Pause receiving request data (until current chunk is written)
			    req.pause();
			    fileStream.write(data, "binary");
			});
		}
	}
	console.log(req.headers)
    form.parse(req);
  } else {
    res.writeHead(404, {'content-type': 'text/plain'});
    res.end('404');
  }
});
server.listen(TEST_PORT);

console.log('listening on http://localhost:'+TEST_PORT+'/');
