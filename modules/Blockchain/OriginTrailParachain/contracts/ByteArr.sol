pragma solidity ^0.4.19;

library ByteArr {
    function indexOf(bytes32[] storage self, bytes32 item) view internal returns (uint index, bool isThere) {
        for (uint i = 0; i < self.length; i++) {
            if (self[i] == item) {
                return (i,true);
            }
        }
        return (0, false);
    }

    function indexOf(uint256[] storage self, uint256 item) view internal returns (uint index, bool isThere) {
        for (uint i = 0; i < self.length; i++) {
            if (self[i] == item) {
                return (i,true);
            }
        }
        return (0, false);
    }

    function removeByIndex(bytes32[] storage self, uint256 index) internal returns (bytes32[]) {
        if (index >= self.length) return;

        self[index] = self[self.length-1];
        delete self[self.length-1];
        self.length = self.length - 1;

        return self;
    }

    function removeByIndex(uint256[] storage self, uint256 index) internal returns (uint256[]) {
        if (index >= self.length) return;

        self[index] = self[self.length-1];
        delete self[self.length-1];
        self.length = self.length - 1;

        return self;
    }

    function getFuncHash(bytes _data) pure internal returns (bytes4) {
        bytes4 output;
        for (uint i = 0; i < 4; i++) {
            output |= bytes4(_data[i] & 0xFF) >> (i * 8);
        }
        return output;
    }
}