// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../Interfaces/IPriceFeed.sol";
import "../Interfaces/INrUSDB.sol";

contract NrPriceFeed is IPriceFeed {
    IPriceFeed public stPriceFeed;
    INrUSDB public nrToken;
    uint8 public stDecimals;
    uint256 public lastGoodPrice;

    constructor(IPriceFeed _stPriceFeed, INrUSDB _nrToken) {
        stPriceFeed = _stPriceFeed;
        nrToken = _nrToken;
        stDecimals = IERC20Metadata(_nrToken.TOKEN()).decimals();
        fetchPrice();
    }

    function _scale(uint256 stPrice) internal view returns (uint256) {
        return (10 ** stDecimals * stPrice) / nrToken.tokensPerStERC20();
    }

    function fetchPrice() public returns (uint256, bool) {
        (uint256 stPrice, bool b) = stPriceFeed.fetchPrice();
        uint256 price = _scale(stPrice);
        lastGoodPrice = price;
        return (price, b);
    }

    function fetchRedemptionPrice() external returns (uint256, bool) {
        (uint256 stPrice, bool b) = stPriceFeed.fetchRedemptionPrice();
        uint256 price = _scale(stPrice);
        lastGoodPrice = price;
        return (price, b);
    }

    function setAddresses(address _borrowerOperationsAddress) external {}
}
