# Liquidator TEE

Sorry this is really poorly documented I cut this down to the wire getting it working

## How to deploy the tee
Prerequisite - sandbox must be run
1. Host the aztec sandbox and set up the network
```
# IN ANOTHER TERMINAL
aztec start --sandbox
# IN WORKING TERMINAL (won't be blocked)
# assumes you're in ../contracts from where this README.md is located
bun run deploy -p
```
2. Host an ngrok tunnel to the sandbox
```
ngrok http 8080 --domain={YOUR_NGROK_STATIC_DOMAIN}
```
3. Set your .env
```
echo .env.example > .env
### Set these values manually
AZTEC_NODE_URL= (the ngrok domain the tee should use to tunnel into the sandbox)
COINGECKO_API_KEY= (get from coingecko)
PHALA_API_KEY= (get from phala)
### you'll need to set the phala var later to run scripts
```
4. build the docker container from root and push to dockerhub
```
# assumes you're in ../../ from where this README.md is located
# also you can just skip and use the deployed one at 0xjp4g/nocom-liquidator:latest
docker login
docker build --no-cache -f packages/liquidator/Dockerfile -t {YOUR_DOCKERHUB_USERNAME}/nocom-liquidator:latest .
docker push {YOUR_DOCKERHUB_USERNAME}/nocom-liquidator:latest
```
5. deploy the service to the phala tee
```
# assumes youre in . from where this README.md is located
phala auth login [your-api-key]
phala cvm create
# use Dockerfile, no to default config, use .env, deploy
```
6. get the phala CVM api route and
```
phala cvms list
# will output something like 
#
# `App ID     │ app_XXXXXXXXXXXXXXXX`
# `...                              `
# `Node Info  │ https://{YYYYYYYYY}-8090.{ZZZZZZZZZZZZZZZZZZ}:443
#
# copy X for the app id
# copy Z for the (sub)domain
```
7. set the liquidator url in .envs
```
# in .env
LIQUIDATOR_URL=https://{X}-9000.{Z}
# in ../frontend/.env set the same
```
8. check the liquidator was deployed to the phala tee correctly
```
bun run health
```