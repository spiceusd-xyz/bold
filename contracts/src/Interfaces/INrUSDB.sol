// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface INrUSDB {
    function TOKEN() external view returns (address);

    // wrap USDB to NrUSDB
    function wrap(uint256 _amount) external returns (uint256);

    // unwrap NrUSDB to USDB
    function unwrap(uint256 _shares) external returns (uint256);

    function getNrERC20ByStERC20(
        uint256 _amount
    ) external view returns (uint256);

    function getStERC20ByNrERC20(
        uint256 _shares
    ) external view returns (uint256);
}
