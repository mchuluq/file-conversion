# file conversion

File conversion microservice based on [versed](https://github.com/sgbj/versed).

I just added simple authentication with `x-api-key` header or http basic auth.

## Getting started

Run the following commands to get up and running.

```shell
git clone https://github.com/mchuluq/file-conversion.git
cd file-conversion
docker build -t file-conversion .
docker run -d -p 3000:3000 file-conversion
```

Open a browser window and go to http://localhost:3000/.
