Feature: Test various litigation scenarios
  Background: Setup local blockchain and bootstraps
    Given the blockchain is set up
    And 1 bootstrap is running

  @first
  Scenario: Test litigation for one holder which is not responding
    Given the replication difficulty is 0
    And I setup 8 node
    And I override configuration for all nodes
      | dc_holding_time_in_minutes | 5 |
      | numberOfChallenges | 100 |
    And I start the nodes
    And I use 1st node as DC
    And DC imports "importers/xml_examples/Retail/01_Green_to_pink_shipment.xml" as GS1
    Then DC's last import's hash should be the same as one manually calculated
    Given DC initiates the replication for last imported dataset
    And I wait for replications to finish
    Then the last root hash should be the same as one manually calculated
    Then the last import should be the same on all nodes that replicated data
    And I wait for challenges to start
    And I stop 1 holder
    And I remember stopped holder
    And I wait for litigation initiation
    And I start stopped holder
    Then 1 holder should answer litigation
    Then Litigator node should have completed litigation
    Then Stopped holder should have been penalized
    Then Litigator should have started replacement for penalized holder
    Then I wait for 4 replacement replications to finish
    Then I wait for replacement to be completed

