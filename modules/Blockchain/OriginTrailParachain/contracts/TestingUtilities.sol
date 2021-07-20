pragma solidity ^0.4.19;

contract TestingUtilities{
	bool internalData;

	function ecrecovery(bytes32 message, bytes signature)
	public pure returns (address) {
		bytes32 r;
        bytes32 s;
        uint8 v;

        if (signature.length != 65)
          return address(0);

        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, message));

        // The signature format is a compact form of:
        //   {bytes32 r}{bytes32 s}{uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))

            // Here we are loading the last 32 bytes. We exploit the fact that
            // 'mload' will pad with zeroes if we overread.
            // There is no 'mload8' to do this, but that would be nicer.
            v := byte(0, mload(add(signature, 96)))
        }

        // geth uses [0, 1] and some clients have followed. This might change, see:
        //  https://github.com/ethereum/go-ethereum/issues/2053
        if (v < 27) v += 27;

        if (v != 27 && v != 28) return address(0);

        return ecrecover(prefixedHash, v, r, s);
	}

	function getSolution(address holderIdentity0, address holderIdentity1, address holderIdentity2, uint256 shift)
	public pure returns (bytes32) {
		return ( (keccakAddressAddressAddress(holderIdentity0, holderIdentity1, holderIdentity2) >> (shift * 4)) & bytes32( 2 ** (4 * 1) - 1));
	}


	function keccakBytesAddress(bytes32 a, address b)
	public pure returns (bytes32) {
		return keccak256(abi.encodePacked(uint256(a),uint256(b)));
	}

	function keccakBytesAddressNumber(bytes32 a, address b, uint256 c)
	public pure returns (bytes32) {
		return keccak256(abi.encodePacked(uint256(a),uint256(b),uint256(c)));
	}

	function keccakAddressAddressAddress(address a, address b, address c)
	public pure returns (bytes32) {
		return keccak256(abi.encodePacked(a,b,c));
	}

	function keccakBytesBytesBytes(bytes32 a, bytes32 b, bytes32 c)
	public pure returns (bytes32) {
		return keccak256(abi.encodePacked(a,b,c));
	}

	function keccakBytesBytes(bytes32 a, bytes32 b)
	public pure returns (bytes32) {
		return keccak256(abi.encodePacked(a,b));
	}

	// function to decrypt hashes of the merkle tree
	function decryptCiphertext(uint _index, bytes32 key, bytes32 _ciphertext) public pure returns (bytes32){
		return keccak256(abi.encodePacked(key, _index)) ^ _ciphertext;
	}

	function keccakAddress(address a)
	public pure returns (bytes32) {
		return keccak256(abi.encodePacked(a));
	}

	function keccak2hashes(bytes32 a, bytes32 b)
	public pure returns (bytes32){
		return keccak256(abi.encodePacked(a,b));
	}

	function keccakString(string a)
	public pure returns (bytes32){
		return keccak256(abi.encodePacked(a));
	}

	function keccakIndex(bytes32 a, uint b)
	public pure returns (bytes32){
		return keccak256(abi.encodePacked(a,b));
	}

	function keccakIndexIndex(bytes32 a, uint b, uint c)
	public pure returns (bytes32){
		return keccak256(abi.encodePacked(a,b,c));
	}

	function keccakSender()
	public view returns (bytes32){
		return keccak256(abi.encodePacked(msg.sender));
	}

	function keccakAddressBytes(address adr, bytes32 byt)
	public pure returns (bytes32){
		return keccak256(abi.encodePacked(adr, byt));
	}

	function keccakOffer(address adr, bytes32 nod_id, uint data_id)
	public pure returns (bytes32){
		return keccak256(abi.encodePacked(adr, nod_id, data_id));
	}

	function getBlockTimestamp()
	public view returns (uint){
		return block.timestamp;
	}

	function getBlockNumber()
	public view returns (uint){
		return block.number;
	}

	function xorBytes(bytes32 byt1, bytes32 byt2)
	public pure returns (bytes32){
		return byt1 ^ byt2;
	}

	function transfer(address recipient)
	public payable {
		recipient.transfer(msg.value);
	}

	function moveTheBlock()
	public{
		internalData = !internalData;
	}

	function escrowHash(bytes32 offer_hash, address DH_wallet, bytes32 DH_node_id)
	public pure returns (bytes32){
		return keccak256(abi.encodePacked(offer_hash, DH_wallet, DH_node_id));
	}

	event PreIPosle(uint a);

	function error()
	public{
		emit PreIPosle(1);
		require(false);
		emit PreIPosle(2);
	}
}