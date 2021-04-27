pragma solidity ^0.4.18;

/**
 * @title SafeMath
 * @dev Math operations with safety checks that throw on error
 */


library SafeMath {
	function mul(uint256 a, uint256 b) internal pure returns (uint256) {
		uint256 c = a * b;
		assert(a == 0 || c / a == b);
		return c;
	}

	function div(uint256 a, uint256 b) internal pure returns (uint256) {
		// assert(b > 0); // Solidity automatically throws when dividing by 0
		uint256 c = a / b;
		// assert(a == b * c + a % b); // There is no case in which this doesn't hold
		return c;
	}

	function sub(uint256 a, uint256 b) internal pure returns (uint256) {
		assert(b <= a);
		return a - b;
	}

	function add(uint256 a, uint256 b) internal pure returns (uint256) {
		uint256 c = a + b;
		assert(c >= a);
		return c;
	}
}

/**
 * @title Ownable
 * @dev The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
contract Ownable {
	address public owner;
	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

	/**
	 * @dev The Ownable constructor sets the original `owner` of the contract to the sender
	 * account.
	 */
	function Ownable() public { owner = msg.sender; }

	/**
	 * @dev Throws if called by any account other than the owner.
	 */
	modifier onlyOwner() { require(msg.sender == owner); _; }


	/**
	 * @dev Allows the current owner to transfer control of the contract to a newOwner.
	 * @param newOwner The address to transfer ownership to.
	 */
	function transferOwnership(address newOwner) onlyOwner public {
		require(newOwner != address(0));
		OwnershipTransferred(owner, newOwner);
		owner = newOwner;
	}

}

/**
 * @title ERC20Basic
 * @dev Simpler version of ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/179
 */
contract ERC20Basic {
	uint256 public totalSupply;
	function balanceOf(address who) public constant returns (uint256);
	function transfer(address to, uint256 value) public returns (bool);
	event Transfer(address indexed from, address indexed to, uint256 value);
}


/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract BasicToken is ERC20Basic {
	using SafeMath for uint256;

	mapping(address => uint256) balances;

	/**
	* @dev transfer token for a specified address
	* @param _to The address to transfer to.
	* @param _value The amount to be transferred.
	*/
	function transfer(address _to, uint256 _value) public returns (bool) {
		require(_to != address(0));
		require(_value <= balances[msg.sender]);

		// SafeMath.sub will throw if there is not enough balance.
		balances[msg.sender] = balances[msg.sender].sub(_value);
		balances[_to] = balances[_to].add(_value);
		Transfer(msg.sender, _to, _value);
		return true;
	}

	/**
	* @dev Gets the balance of the specified address.
	* @param _owner The address to query the the balance of.
	* @return An uint256 representing the amount owned by the passed address.
	*/
	function balanceOf(address _owner) public constant returns (uint256 balance) {
		return balances[_owner];
	}

}


/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 */
contract ERC20 is ERC20Basic {
	function allowance(address owner, address spender) public constant returns (uint256);
	function transferFrom(address from, address to, uint256 value) public returns (bool);
	function approve(address spender, uint256 value) public returns (bool);
	event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title Standard ERC20 token
 *
 * @dev Implementation of the basic standard token.
 * @dev https://github.com/ethereum/EIPs/issues/20
 * @dev Based on code by FirstBlood: https://github.com/Firstbloodio/token/blob/master/smart_contract/FirstBloodToken.sol
 */
contract StandardToken is ERC20, BasicToken {

	mapping (address => mapping (address => uint256)) internal allowed;


	/**
	 * @dev Transfer tokens from one address to another
	 * @param _from address The address which you want to send tokens from
	 * @param _to address The address which you want to transfer to
	 * @param _value uint256 the amount of tokens to be transferred
	 */
	function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
		require(_to != address(0));
		require(_value <= balances[_from]);
		require(_value <= allowed[_from][msg.sender]);

		balances[_from] = balances[_from].sub(_value);
		balances[_to] = balances[_to].add(_value);
		allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
		Transfer(_from, _to, _value);
		return true;
	}

	/**
	 * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
	 *
	 * Beware that changing an allowance with this method brings the risk that someone may use both the old
	 * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
	 * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
	 * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
	 * @param _spender The address which will spend the funds.
	 * @param _value The amount of tokens to be spent.
	 */
	function approve(address _spender, uint256 _value) public returns (bool) {
		// mitigating the race condition
		assert(allowed[msg.sender][_spender] == 0 || _value == 0);

		allowed[msg.sender][_spender] = _value;
		Approval(msg.sender, _spender, _value);
		return true;
	}

	/**
	 * @dev Function to check the amount of tokens that an owner allowed to a spender.
	 * @param _owner address The address which owns the funds.
	 * @param _spender address The address which will spend the funds.
	 * @return A uint256 specifying the amount of tokens still available for the spender.
	 */
	function allowance(address _owner, address _spender) public constant returns (uint256 remaining) {
		return allowed[_owner][_spender];
	}

	/**
	 * approve should be called when allowed[_spender] == 0. To increment
	 * allowed value is better to use this function to avoid 2 calls (and wait until
	 * the first transaction is mined)
	 * From MonolithDAO Token.sol
	 */
	function increaseApproval (address _spender, uint _addedValue) public returns (bool success) {
		allowed[msg.sender][_spender] = allowed[msg.sender][_spender].add(_addedValue);
		Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
		return true;
	}

	function decreaseApproval (address _spender, uint _subtractedValue) public returns (bool success) {
		uint oldValue = allowed[msg.sender][_spender];
		if (_subtractedValue > oldValue) {
			allowed[msg.sender][_spender] = 0;
		} else {
			allowed[msg.sender][_spender] = oldValue.sub(_subtractedValue);
		}
		Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
		return true;
	}

}

/**
 * @title Mintable token
 * @dev Simple ERC20 Token example, with mintable token creation
 * @dev Issue: * https://github.com/OpenZeppelin/zeppelin-solidity/issues/120
 * Based on code by TokenMarketNet: https://github.com/TokenMarketNet/ico/blob/master/contracts/MintableToken.sol
 */

contract MintableToken is StandardToken, Ownable {
	event Mint(address indexed to, uint256 amount);
	event MintFinished();

	bool public mintingFinished = false;


	modifier canMint() {
		require(!mintingFinished);
		_;
	}

	/**
	 * @dev Function to mint tokens
	 * @param _to The address that will receive the minted tokens.
	 * @param _amount The amount of tokens to mint.
	 * @return A boolean that indicates if the operation was successful.
	 */
	function mint(address _to, uint256 _amount) onlyOwner canMint public returns (bool) {
		totalSupply = totalSupply.add(_amount);
		balances[_to] = balances[_to].add(_amount);
		Mint(_to, _amount);
		Transfer(0x0, _to, _amount);
		return true;
	}

	/**
	 * @dev Function to stop minting new tokens.
	 * @return True if the operation was successful.
	 */
	function finishMinting() onlyOwner public returns (bool) {
		mintingFinished = true;
		MintFinished();
		return true;
	}
}

contract TracToken is MintableToken {

	string public constant name = 'Test Trace Token';
	string public constant symbol = 'TTRAC';
	uint8 public constant decimals = 18; // one TRAC = 10^18 Tracks
	uint256 public startTime = 1516028400; // initial startTime from tokensale contract
	uint256 public constant bountyReward = 1e25;
	uint256 public constant preicoAndAdvisors = 4e25;
	uint256 public constant liquidityPool = 25e24;
	uint256 public constant futureDevelopment = 1e26;
	uint256 public constant teamAndFounders = 75e24;
	uint256 public constant CORRECTION = 9605598917469000000000;  // overrun tokens

	// Notice: Including compensation for the overminting in initial contract for 9605598917469000000000 TRACKs (~9605.6 Trace tokens)
	uint256[8] public founderAmounts = [uint256( teamAndFounders.div(8).sub(CORRECTION) ),teamAndFounders.div(8),teamAndFounders.div(8),teamAndFounders.div(8),teamAndFounders.div(8),teamAndFounders.div(8),teamAndFounders.div(8),teamAndFounders.div(8)];
	uint256[2] public preicoAndAdvisorsAmounts = [ uint256(preicoAndAdvisors.mul(2).div(5)),preicoAndAdvisors.mul(2).div(5)];

	// Withdraw multisig wallet
	address public wallet;

	// Withdraw multisig wallet
	address public teamAndFoundersWallet;

	// Withdraw multisig wallet
	address public advisorsAndPreICO;
	uint256 public TOTAL_NUM_TOKENS = 5e26;


	function TracToken(address _wallet,address _teamAndFoundersWallet,address _advisorsAndPreICO) public {
		require(_wallet!=0x0);
		require(_teamAndFoundersWallet!=0x0);
		require(_advisorsAndPreICO!=0x0);
		wallet = _wallet;
		teamAndFoundersWallet = _teamAndFoundersWallet;
		advisorsAndPreICO = _advisorsAndPreICO;
	}


	event Transfer(address indexed from, address indexed to, uint256 value);
	event TransferAllowed(bool transferIsAllowed);

	modifier canTransfer() {
		require(mintingFinished);
		_;
	}

	function transferFrom(address from, address to, uint256 value) canTransfer public returns (bool) {
		return super.transferFrom(from, to, value);
	}

	function transfer(address to, uint256 value) canTransfer public returns (bool) {
		return super.transfer(to, value);
	}

	function mint(address contributor, uint256 amount) onlyOwner public returns (bool) {
		return super.mint(contributor, amount);
	}

	function mintMany(address[] contributors, uint256[] amounts) onlyOwner public returns (bool) {
		address contributor;
		uint256 amount;
		require(contributors.length == amounts.length);

		for (uint i = 0; i < contributors.length; i++) {
			contributor = contributors[i];
			amount = amounts[i];
			require(mint(contributor, amount));
		}
		return true;
	}

	function endMinting() onlyOwner public returns (bool) {
		require(!mintingFinished);
		TransferAllowed(true);
		return super.finishMinting();
	}


}