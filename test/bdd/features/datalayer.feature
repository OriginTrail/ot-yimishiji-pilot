Feature: Data layer related features
  Background: Setup local blockchains and bootstraps
    Given the blockchains are set up
    And 1 bootstrap is running

  @third
  Scenario: Check that second gs1 import does not mess up first import's hash value
    Given I setup 4 nodes
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And DC waits for last offer to get written to blockchain
    And I wait for replications to finish
    And I remember previous import's fingerprint value
    And DC imports "importers/xml_examples/Basic/02_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    And DC initiates the replication for last imported dataset
    And DC waits for last offer to get written to blockchain
    Then checking again first import's root hash should point to remembered value

  @skip
  Scenario: Smoke check data-layer basic endpoints
    Given I setup 2 nodes
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given I create json query with path: "identifiers.id", value: "urn:epc:id:sgtin:Batch_1" and opcode: "EQ"
    And DC node makes local query with previous json query
    Then response should contain only last imported data set id
    Given I query DC node locally for last imported data set id
    Then response hash should match last imported data set id

  @first
  Scenario: Basic dataset integrity with it's xml
    Given I setup 1 node
    And I start the node
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Then imported data is compliant with 01_Green_to_pink_shipment.xml file

  @second
  Scenario: Dataset immutability DC and DH side
    Given I setup 5 node
    And I start the node
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    And DC imports "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    Then DC's 2 dataset hashes should match blockchain values
    And I use 2nd node as DH
    Then DH's 2 dataset hashes should match blockchain values


  @skip
  Scenario: Dataset immutability II
    Given I setup 1 node
    And I start the node
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And DC waits for last offer to get written to blockchain
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment_modified_event_timestamp.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And DC waits for last offer to get written to blockchain
    Then DC's 2 dataset hashes should match blockchain values

  @skip
  Scenario: Imported XML's private data should be hashed
    Given I setup 1 node
    And I start the node
    And I use 1st node as DC
    And DC imports "test/modules/test_xml/GraphExample_1.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given I query DC node locally for last imported data set id
    Then DC's local query response should contain hashed private attributes
    Given DC initiates the replication for last imported dataset
    And DC waits for replication window to close
    Given I additionally setup 1 node
    And I start additional nodes
    And I use 2nd node as DV
    Given DV publishes query consisting of path: "identifiers.id", value: "urn:epc:id:sgtin:Batch_1" and opcode: "EQ" to the network
    Then all nodes with last import should answer to last network query by DV
    Given the DV purchases last import from the last query from the DC
    Given I query DV node locally for last imported data set id
    Then DV's local query response should contain hashed private attributes

  @fourth
  Scenario: Remote event connection on DH and DV
    Given I setup 5 nodes
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    And DC imports "importers/xml_examples/Retail/02_Green_to_Pink_receipt.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    And I use 2nd node as DH

#    Given DH calls consensus endpoint for sender: "urn:ot:object:actor:id:Company_Green"
#    Then last consensus response should have 1 event with 1 match
#    Given DH calls consensus endpoint for sender: "urn:ot:object:actor:id:Company_Pink"
#    Then last consensus response should have 1 event with 1 match

    Given I additionally setup 1 node
    And I start additional nodes
    And I use 6th node as DV
    Given DV publishes query consisting of path: "identifiers.id", value: "urn:epc:id:sgtin:Batch_1" and opcode: "EQ" to the network
    Then all nodes with last import should answer to last network query by DV

#    And the DV purchases last import from the last query from a DH

    Given DV publishes query consisting of path: "identifiers.id", value: "urn:epc:id:sgln:Building_Green_V1" and opcode: "EQ" to the network
    Then all nodes with second last import should answer to last network query by DV

#    And the DV purchases second last import from the last query from a DH
#    And DV calls consensus endpoint for sender: "urn:ot:object:actor:id:Company_Pink"
#    Then last consensus response should have 1 event with 1 match
#    And DV calls consensus endpoint for sender: "urn:ot:object:actor:id:Company_Green"
#    Then last consensus response should have 1 event with 1 match

  @skip
  Scenario: Latest datalayer import and data read query
    Given I setup 1 node
    And I start the node
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    And DC imports "importers/xml_examples/Retail/02_Green_to_Pink_receipt.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given I create json query with path: "identifiers.id", value: "urn:epc:id:sgtin:Batch_1" and opcode: "EQ"
    Then response should return same dataset_ids as second last import and last import

  @fourth
  Scenario: Data read and export successfully
    Given the replication difficulty is 1
    And I setup 4 nodes
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    Given I additionally setup 1 node
    And I start additional nodes
    And I use 5th node as DV
    Given DV publishes query consisting of path: "identifiers.id", value: "urn:epc:id:sgtin:Batch_1" and opcode: "EQ" to the network
    Then all nodes with last import should answer to last network query by DV
    Given the DV sends read and export for last import from DC as GS1-EPCIS
    And DV waits for export to finish
    Then the last exported dataset data should be the same as "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml"

  @skip
  Scenario: Data location with multiple identifiers
    Given I setup 1 node
    And I start the node
    And I use 1st node as DC
    And DC imports "test/modules/test_xml/MultipleIdentifiers.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given I create json query with path: "id", value: "urn:ot:object:product:id:P1" and opcode: "EQ"
    And I append json query with path: "ean13", value: "1234567890123" and opcode: "EQ"
    Given DC node makes local query with previous json query
    Then response should contain only last imported data set id

  @second
  Scenario: Graph level data encryption
    Given the replication difficulty is 1
    And I setup 4 nodes
    And I override configuration for all nodes
      | dc_holding_time_in_minutes | 3 |
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    Then DHs should be payed out for all offers

  @fourth
  Scenario: Import and export of an arbitrary data
    Given I setup 1 node
    And I start the node
    And I use 1st node as DC
    And DC imports "importers/use_cases/certs/0FID_company-red_company-red.xml" as GS1-EPCIS
    And DC waits for import to finish
    When DC exports the last imported dataset as OT-JSON
    And DC waits for export to finish
    Then the last exported dataset should contain "../../../importers/use_cases/certs/halal.jpg" data as "urn:ot:object:product:batch:Id:pVey_company-red_company-red"


  @first
  Scenario: Challenge request-response test
    Given I setup 4 nodes
    And I override configuration for all nodes
      | dc_holding_time_in_minutes | 5 |
      | numberOfChallenges | 100 |
      | challengeResponseTimeMills | 5000 |
    And I start the nodes
    And I use 1st node as DC
    And I use 3th node as DH
    And DC imports "importers/xml_examples/Basic/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    Then DC should send a challenge request
    Then DH should send the challenge response
    Then DC should verify the response


  @second
  Scenario: Node should not respond to network query if he did't replicate it itself
    Given the replication difficulty is 1
    And I setup 4 nodes
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    And I use 2nd node as DV
    Given DV publishes query consisting of path: "identifiers.id", value: "urn:epc:id:sgtin:Batch_1" and opcode: "EQ" to the network
    Then Answer for the last network query by DV should be empty
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    Given DV publishes query consisting of path: "identifiers.id", value: "urn:epc:id:sgtin:Batch_1" and opcode: "EQ" to the network
    Then all nodes with last import should answer to last network query by DV



  @third
  Scenario: Cover message routing protocol via proxy nodes
    Given the replication difficulty is 1
    And I setup 10 nodes
    And I override configuration for 3rd node
      | dh_price_factor | 100 |
    And I override configuration for 4th node
      | dh_price_factor | 100 |
    And I override configuration for 5th node
      | dh_price_factor | 100 |
    And I override configuration for 6th node
      | dh_price_factor | 100 |
    And I override configuration for 7th node
      | dh_price_factor | 100 |
    And I override configuration for 8th node
      | dh_price_factor | 100 |
    And I setup 1st node kademlia identity
      | privateKey | 22bb0a45a5ab03cea8a68c991a0b5159c9edcda163840a7ed868f16cfda6a41a |
      | nonce | 3 |
      | proof | b58510009b511e0050843400bf603c00a3690e0069033e0003210a00252e1600e8531500a8d91f0025c10e00c3a32200e85a1000bda53c00a4c51a00bb8f300020dd02001be82400fe9932002dc13b00bf982f00a0d73f008ff51f00b814360025471600859b39008e0b2300115f3b00797b1100a52f350039db14002cc02900 |
    And I setup 2nd node kademlia identity
      | privateKey | e50d93f4015e55884e5ec8cb565ce8cf93d9d34a890fb91823b29599f2de6ad9 |
      | nonce | 3 |
      | proof | 5cf60c00dc651c00b9f80700646018002dbf1900db63240064441100b1573700e3be1700eba919009b441700c08b180028c50a0058212a0074f20200bda60e008f220900ffb11700bc061d00fcfa3c00947f1600549224007b1c060003551300be7d0d0007ba1d0068531b00db8b2c0089de0000f1bf1200276814007b042100 |
    And I setup 3rd node kademlia identity
      | privateKey | 6a3cb3261d109dd5bad9cbedd25d30cfe04adea1468097b538ad1272b453b008 |
      | nonce | 2 |
      | proof | 482e0600e61a2f006258150083453600d8a213007a97330018072a0044673a00d5ce11004ab93200a6461f00f3f43a0010640900b17f1c000e980c000aaa35004f61090059e11900469005009d3a2a007c7c1900bb5e3a0084120700c9371300990d130085de1f00967f1100127a2600c23903005bd71700ff2c000071190800 |
    And I setup 4th node kademlia identity
      | privateKey | 6114c3e2d542083668e154114bb8b4463cdb03860ee68788f2cb2a3375fd18f9 |
      | nonce | 9 |
      | proof | 9f1a0a00550e1a002dac1a0062c9230007d938009ed83900b2610100cd58350007c40c00fbc11c006ff020003a933f0091b5150005fb2200c41014000a8e1a00191c16009737220078fa10009268210002940400040c060054542e00c2f93f00524d070080f91a0072550c00ffbc3d002f590a00c5162a00cbb815006c163000 |
    And I setup 5th node kademlia identity
      | privateKey | f4a6c4b1108e7acd50ec00517025a877bde1215a69f235061bff6d3a120c1497 |
      | nonce | 9 |
      | proof | a30d0600b55e3000bf1c0a00d2f732008683170021f7180052141000935812002a580800117e150013642200c6cd2d00c9182500eb8b3c00e7df2b003c1936007931060063612b00081500001fff1900c7363700df1b3900f1450f0078603600d21a0000e2a20200419510008605140063c30e0011e42800371e0b0051963e00 |
    And I setup 6th node kademlia identity
      | privateKey | 32ddf611f0eee6b7d648b0135f8c2d81ecbf77c27ff72dcc19e6624977610afa |
      | nonce | 2 |
      | proof | 363804006e3e040025ac08007d922c0064000e000303310088de1d00a8f22700ad9825007bdf3100f3332000073c2600e3a21500b5a12a00d29713002016190090d918009de9330043b91800755e32001860020093860700ddaf0100fed92d0094c22700dcb5340095b21100c1b21a00c376170048511c00b14019005f422200 |
    And I setup 7th node kademlia identity
      | privateKey | 2c4e5e9b5df854f4dbc09218804666f5019b19feddf92ee9af0693fd372772e5 |
      | nonce | 6 |
      | proof | 2f582f003c63340040990a00d0f92100eec30d0026c91b00a9d51200194e23009f5b0200e6af2300a8f61b00ac671c00db6e1200e6801800ba310d0067b51f0051110500db7a1e00d6a71900db733e0060a213006cb4340050890f00670419000f0d0d00900e240011ce2300e9e02f0042b6120047c922001c300400ab802500 |
    And I setup 8th node kademlia identity
      | privateKey | 422c3249a8d4cd234a7749aafd6cb16ba0473efafaa4852a3eda499156cd551c |
      | nonce | 2 |
      | proof | 73ba15008e8639006f8c15007fec3400e57c020067e425005ad00a004a291600dfcc0500c6490900a893090046e237002c462a0098003b00c7de1400cc8025007bac0200d9430300c4dd0000e8a62c0090762900f18b2b001b69190031df1a0044b504000db9080091910100772a1b002e120600ad411f0027b71a00e41a2300 |
    And I setup 9th node kademlia identity
      | privateKey | 0c889c345307126ec08d1945c8c814696953125b73178370a255590a70c955c2 |
      | nonce | 7 |
      | proof | 64592d00fee93b005495260055b93b000b552c0080bb3a00a0ec030030211800ec0d0c00bae41d0078da1800d04d28000a1e130033062800c9881d002bed2d00138e1f00e15a2b00a71e1600b28b2a003c7d170055cd2a0000120d007d051300e6c40d00dc0b1d00e3ec3100521632003efa0e007fc61b0096b80f0024422900 |
    And I setup 10th node kademlia identity
      | privateKey | a1560bd71fc90e95802cfad2cfb0b6412a2f4fdc311351c4cbee460c01ef7e0c |
      | nonce | 2 |
      | proof | f9e30d00e6fc33002fe50200d46e1c00deff1600cecf3800d72307002e0b360022480f007624130030660b00981c2f00736c1200788b1e005224000060651200aeb81c0005352000bc660d0046191600bf4a06007bdb2a00f74e12005de7230034f91e0074c32d007c441a00582c2f003972050092f609008e40190064a82500 |
    And I start the 2nd node
    And I start the 3rd node
    And I start the 4th node
    And I start the 5th node
    And I start the 6th node
    And I start the 7th node
    And I start the 8th node
    And I start the 9th node
    And I start the 1st node
    And I stop the 1st node
    And I start the 10th node
    And I start the 1st node
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml" as GS1-EPCIS
    And DC waits for import to finish
    Given DC initiates the replication for last imported dataset
    And DC waits for public key request
    And I wait for replications to finish

  @fourth
  Scenario: Check that local query returns valid object
    And I setup 1 nodes
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/json_examples/local-query1.json" as GRAPH
    And DC waits for import to finish
    And DC imports "importers/json_examples/local-query2.json" as GRAPH
    And DC waits for import to finish
    Given DC runs local query consisting of path: "id", value: "test1" and opcode: "EQ"
    Then  The last local query should return otObject from the last imported dataset

  @fifth
  Scenario: Node should not import same dataset twice
    And I setup 1 nodes
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/json_examples/local-query1.json" as GRAPH
    And DC waits for import to finish
    And DC imports "importers/json_examples/local-query1.json" as GRAPH
    And DC should skip import for the same dataset
