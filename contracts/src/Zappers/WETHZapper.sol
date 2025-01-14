// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import "./BaseZapper.sol";
import "../Dependencies/Constants.sol";
import "../interfaces/INrETH.sol";

contract WETHZapper is BaseZapper {
    using SafeERC20 for IERC20;

    IERC20 public immutable collToken;

    constructor(
        IAddressesRegistry _addressesRegistry,
        IFlashLoanProvider _flashLoanProvider,
        IExchange _exchange
    ) BaseZapper(_addressesRegistry, _flashLoanProvider, _exchange) {
        collToken = _addressesRegistry.collToken();
        require(
            address(WETH) == INrETH(payable(address(collToken))).TOKEN(),
            "WZ: Wrong coll branch"
        );

        // Approve coll to BorrowerOperations
        WETH.approve(address(borrowerOperations), type(uint256).max);
        collToken.approve(address(borrowerOperations), type(uint256).max);
        // Approve Coll to exchange module (for closeTroveFromCollateral)
        WETH.approve(address(_exchange), type(uint256).max);
        collToken.approve(address(_exchange), type(uint256).max);
    }

    function _wrapToColl(uint256 _amount) internal returns (uint256) {
        INrETH t = INrETH(payable(address(collToken)));
        uint256 shares = t.getNrERC20ByStERC20(_amount);
        uint256 wrapAmount = t.getStERC20ByNrERC20(shares);
        WETH.approve(address(collToken), wrapAmount);
        uint256 remains = _amount - wrapAmount;
        if (remains > 0) {
            WETH.transfer(msg.sender, _amount - wrapAmount);
        }
        return t.wrap(wrapAmount);
    }

    function _unwrapFromColl(uint256 _amount) internal returns (uint256) {
        INrETH t = INrETH(payable(address(collToken)));
        return t.unwrap(_amount);
    }

    function openTroveWithRawETH(
        OpenTroveParams calldata _params
    ) external payable returns (uint256) {
        require(msg.value > ETH_GAS_COMPENSATION, "WZ: Insufficient ETH");
        require(
            _params.batchManager == address(0) ||
                _params.annualInterestRate == 0,
            "WZ: Cannot choose interest if joining a batch"
        );

        // Convert ETH to WETH
        WETH.deposit{value: msg.value}();
        uint256 amount = _wrapToColl(msg.value - ETH_GAS_COMPENSATION);

        uint256 troveId;
        if (_params.batchManager == address(0)) {
            troveId = borrowerOperations.openTrove(
                _params.owner,
                _params.ownerIndex,
                amount,
                _params.boldAmount,
                _params.upperHint,
                _params.lowerHint,
                _params.annualInterestRate,
                _params.maxUpfrontFee,
                // Add this contract as add/receive manager to be able to fully adjust trove,
                // while keeping the same management functionality
                address(this), // add manager
                address(this), // remove manager
                address(this) // receiver for remove manager
            );
        } else {
            IBorrowerOperations.OpenTroveAndJoinInterestBatchManagerParams
                memory openTroveAndJoinInterestBatchManagerParams = IBorrowerOperations
                    .OpenTroveAndJoinInterestBatchManagerParams({
                        owner: _params.owner,
                        ownerIndex: _params.ownerIndex,
                        collAmount: amount,
                        boldAmount: _params.boldAmount,
                        upperHint: _params.upperHint,
                        lowerHint: _params.lowerHint,
                        interestBatchManager: _params.batchManager,
                        maxUpfrontFee: _params.maxUpfrontFee,
                        // Add this contract as add/receive manager to be able to fully adjust trove,
                        // while keeping the same management functionality
                        addManager: address(this), // add manager
                        removeManager: address(this), // remove manager
                        receiver: address(this) // receiver for remove manager
                    });
            troveId = borrowerOperations.openTroveAndJoinInterestBatchManager(
                openTroveAndJoinInterestBatchManagerParams
            );
        }

        boldToken.transfer(msg.sender, _params.boldAmount);

        // Set add/remove managers
        _setAddManager(troveId, _params.addManager);
        _setRemoveManagerAndReceiver(
            troveId,
            _params.removeManager,
            _params.receiver
        );

        return troveId;
    }

    function addCollWithRawETH(uint256 _troveId) external payable {
        address owner = troveNFT.ownerOf(_troveId);
        _requireSenderIsOwnerOrAddManager(_troveId, owner);
        // Convert ETH to WETH
        WETH.deposit{value: msg.value}();
        uint256 amount = _wrapToColl(msg.value);

        borrowerOperations.addColl(_troveId, amount);
    }

    function withdrawCollToRawETH(uint256 _troveId, uint256 _amount) external {
        address owner = troveNFT.ownerOf(_troveId);
        address payable receiver = payable(
            _requireSenderIsOwnerOrRemoveManagerAndGetReceiver(_troveId, owner)
        );

        borrowerOperations.withdrawColl(_troveId, _amount);

        // Convert WETH to ETH
        uint256 unwrappedAmount = _unwrapFromColl(_amount);
        WETH.withdraw(unwrappedAmount);
        (bool success, ) = receiver.call{value: unwrappedAmount}("");
        require(success, "WZ: Sending ETH failed");
    }

    function withdrawBold(
        uint256 _troveId,
        uint256 _boldAmount,
        uint256 _maxUpfrontFee
    ) external {
        address owner = troveNFT.ownerOf(_troveId);
        address receiver = _requireSenderIsOwnerOrRemoveManagerAndGetReceiver(
            _troveId,
            owner
        );

        borrowerOperations.withdrawBold(_troveId, _boldAmount, _maxUpfrontFee);

        // Send Bold
        boldToken.transfer(receiver, _boldAmount);
    }

    function repayBold(uint256 _troveId, uint256 _boldAmount) external {
        address owner = troveNFT.ownerOf(_troveId);
        _requireSenderIsOwnerOrAddManager(_troveId, owner);

        // Set initial balances to make sure there are not lefovers
        InitialBalances memory initialBalances;
        _setInitialTokensAndBalances(WETH, boldToken, initialBalances);

        // Pull Bold
        boldToken.transferFrom(msg.sender, address(this), _boldAmount);

        borrowerOperations.repayBold(_troveId, _boldAmount);

        // return leftovers to user
        _returnLeftovers(initialBalances);
    }

    function adjustTroveWithRawETH(
        uint256 _troveId,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _boldChange,
        bool _isDebtIncrease,
        uint256 _maxUpfrontFee
    ) external payable {
        InitialBalances memory initialBalances;
        (address payable receiver, uint256 newCollChange) = _adjustTrovePre(
            _troveId,
            _collChange,
            _isCollIncrease,
            _boldChange,
            _isDebtIncrease,
            initialBalances
        );
        borrowerOperations.adjustTrove(
            _troveId,
            newCollChange,
            _isCollIncrease,
            _boldChange,
            _isDebtIncrease,
            _maxUpfrontFee
        );
        _adjustTrovePost(
            newCollChange,
            _isCollIncrease,
            _boldChange,
            _isDebtIncrease,
            receiver,
            initialBalances
        );
    }

    function adjustZombieTroveWithRawETH(
        uint256 _troveId,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _boldChange,
        bool _isDebtIncrease,
        uint256 _upperHint,
        uint256 _lowerHint,
        uint256 _maxUpfrontFee
    ) external payable {
        InitialBalances memory initialBalances;
        (address payable receiver, uint256 newCollChange) = _adjustTrovePre(
            _troveId,
            _collChange,
            _isCollIncrease,
            _boldChange,
            _isDebtIncrease,
            initialBalances
        );
        borrowerOperations.adjustZombieTrove(
            _troveId,
            newCollChange,
            _isCollIncrease,
            _boldChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint,
            _maxUpfrontFee
        );
        _adjustTrovePost(
            newCollChange,
            _isCollIncrease,
            _boldChange,
            _isDebtIncrease,
            receiver,
            initialBalances
        );
    }

    function _adjustTrovePre(
        uint256 _troveId,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _boldChange,
        bool _isDebtIncrease,
        InitialBalances memory _initialBalances
    ) internal returns (address payable, uint256) {
        if (_isCollIncrease) {
            require(_collChange == msg.value, "WZ: Wrong coll amount");
        } else {
            require(
                msg.value == 0,
                "WZ: Not adding coll, no ETH should be received"
            );
        }

        address payable receiver = payable(
            _checkAdjustTroveManagers(
                _troveId,
                _collChange,
                _isCollIncrease,
                _boldChange,
                _isDebtIncrease
            )
        );

        // Set initial balances to make sure there are not lefovers
        _setInitialTokensAndBalances(WETH, boldToken, _initialBalances);

        // ETH -> WETH
        if (_isCollIncrease) {
            WETH.deposit{value: _collChange}();
            _collChange = _wrapToColl(_collChange);
        }

        // Pull Bold
        if (!_isDebtIncrease) {
            boldToken.transferFrom(msg.sender, address(this), _boldChange);
        }

        return (receiver, _collChange);
    }

    function _adjustTrovePost(
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _boldChange,
        bool _isDebtIncrease,
        address payable _receiver,
        InitialBalances memory _initialBalances
    ) internal {
        // Send Bold
        if (_isDebtIncrease) {
            boldToken.transfer(_receiver, _boldChange);
        }

        // return BOLD leftovers to user (trying to repay more than possible)
        uint256 currentBoldBalance = boldToken.balanceOf(address(this));
        if (currentBoldBalance > _initialBalances.balances[1]) {
            boldToken.transfer(
                _initialBalances.receiver,
                currentBoldBalance - _initialBalances.balances[1]
            );
        }
        // There shouldn’t be Collateral leftovers, everything sent should end up in the trove

        // WETH -> ETH
        if (!_isCollIncrease && _collChange > 0) {
            uint256 unwrappedAmount = _unwrapFromColl(_collChange);
            WETH.withdraw(unwrappedAmount);
            (bool success, ) = _receiver.call{value: unwrappedAmount}("");
            require(success, "WZ: Sending ETH failed");
        }
        // TODO: remove before deployment!!
        assert(address(this).balance == 0);
        assert(WETH.balanceOf(address(this)) == 0);
    }

    function closeTroveToRawETH(uint256 _troveId) external {
        address owner = troveNFT.ownerOf(_troveId);
        address payable receiver = payable(
            _requireSenderIsOwnerOrRemoveManagerAndGetReceiver(_troveId, owner)
        );

        // pull Bold for repayment
        LatestTroveData memory trove = troveManager.getLatestTroveData(
            _troveId
        );
        boldToken.transferFrom(msg.sender, address(this), trove.entireDebt);

        borrowerOperations.closeTrove(_troveId);

        uint256 unwrappedAmount = _unwrapFromColl(trove.entireColl);
        WETH.withdraw(unwrappedAmount + ETH_GAS_COMPENSATION);
        (bool success, ) = receiver.call{
            value: unwrappedAmount + ETH_GAS_COMPENSATION
        }("");
        require(success, "WZ: Sending ETH failed");
    }

    function closeTroveFromCollateral(
        uint256 _troveId,
        uint256 _flashLoanAmount
    ) external virtual override {}

    function receiveFlashLoanOnCloseTroveFromCollateral(
        CloseTroveParams calldata _params,
        uint256 _effectiveFlashLoanAmount
    ) external virtual override {}

    receive() external payable {}

    // Unimplemented flash loan receive functions for leverage
    function receiveFlashLoanOnOpenLeveragedTrove(
        ILeverageZapper.OpenLeveragedTroveParams calldata _params,
        uint256 _effectiveFlashLoanAmount
    ) external virtual override {}
    function receiveFlashLoanOnLeverUpTrove(
        ILeverageZapper.LeverUpTroveParams calldata _params,
        uint256 _effectiveFlashLoanAmount
    ) external virtual override {}
    function receiveFlashLoanOnLeverDownTrove(
        ILeverageZapper.LeverDownTroveParams calldata _params,
        uint256 _effectiveFlashLoanAmount
    ) external virtual override {}
}
