#!/bin/bash

set -ev
docker ps -a
docker build --file Dockerfile.development -t myimage:latest .
docker images
# TODO make sure that following hub contract address is in origintrail_noderc.image
cat $ARTIFACTS_DIR/truffle-migrate.log | grep "Hub contract address:"
node test/docker/getHubAddress.js
cp origintrail_noderc.image new_config_file
docker run -d --name=mynode -p 8900:8900 -p 5278:5278 -p 3000:3000 --network host -v new_config_file:/ot-node/.origintrail_noderc myimage:latest
# TODO make sure that one of acct-keys is in origintrail_noderc.image
# cat $ARTIFACTS_DIR/acct-keys.log
# Give some time for node to start
sleep 180
# docker container inspect mynode
# docker network inspect host
docker logs mynode --tail 1000 > $ARTIFACTS_DIR/docker.logs
docker exec mynode /bin/sh -c "curl -X POST http://127.0.0.1:8900/api/latest/import -F standard_id=GS1-EPCIS -F file=@/importers/xml_examples/Retail/03_Pink_to_orange_shipment.xml" > importResult.json
cat importResult.json > $ARTIFACTS_DIR/importResult.json
# TODO better asserts that import response has one key, handler_id
grep -q 'handler_id' importResult.json
