// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface INrETH {
    function TOKEN() external view returns (address);

    // wrap ETH to NrETH
    receive() external payable;

    // wrap WETH to NrETH
    function wrap(uint256 _amount) external returns (uint256);

    // unwrap NrETH to WETH
    function unwrap(uint256 _shares) external returns (uint256);

    function getNrERC20ByStERC20(
        uint256 _amount
    ) external view returns (uint256);

    function getStERC20ByNrERC20(
        uint256 _shares
    ) external view returns (uint256);
}
