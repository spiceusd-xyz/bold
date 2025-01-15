// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../BorrowerOperations.sol";
import "../Interfaces/IPriceFeed.sol";

contract SelfHostPriceFeed is IPriceFeed {

    /// @notice The min update interval (5 minutes)
    uint256 public constant UPDATE_INTERVAL = 5 minutes;

    /// @notice The max swing of the price per update (20%)
    uint256 public constant MAX_SWING = 2000;

    /// @notice The poster address
    address public poster;

    /// @notice The last good price
    uint256 public lastGoodPrice;

    /// @notice The last update time
    uint256 public lastUpdateTime;

    constructor(address _poster) {
        poster = _poster;
    }

    function fetchPrice() external override returns (uint256, bool) {
        return (lastGoodPrice, false);
    }

    function fetchRedemptionPrice() external override returns (uint256, bool) {
        return (lastGoodPrice, false);
    }

    // Manual external price setter.
    function setPrice(uint256 _newPrice) external returns (bool) {
        require(msg.sender == poster, "caller is not the poster");

        if (lastGoodPrice != 0) {
            uint256 maxPrice = _newPrice * (MAX_SWING + 10000) / 10000;
            uint256 minPrice = _newPrice * (10000 - MAX_SWING) / 10000;
            require(lastGoodPrice <= maxPrice && lastGoodPrice >= minPrice, "price swing too high");
            require(block.timestamp - lastUpdateTime >= UPDATE_INTERVAL, "min update interval not reached");
        }

        // Update the price and last updated time.
        lastGoodPrice = _newPrice;
        lastUpdateTime = block.timestamp;

        return true;
    }

    function setAddresses(address _borrowerOperationsAddress) external {}
}
