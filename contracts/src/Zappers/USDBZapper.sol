// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import "./BaseZapper.sol";
import "../Dependencies/Constants.sol";
import "../interfaces/INrUSDB.sol";

contract USDBZapper is BaseZapper {
    using SafeERC20 for IERC20;

    IERC20 public immutable collToken;
    IERC20 public immutable stCollToken;

    constructor(
        IAddressesRegistry _addressesRegistry,
        IFlashLoanProvider _flashLoanProvider,
        IExchange _exchange
    ) BaseZapper(_addressesRegistry, _flashLoanProvider, _exchange) {
        collToken = _addressesRegistry.collToken();
        stCollToken = IERC20(INrUSDB(address(collToken)).TOKEN());
        require(address(WETH) != address(collToken), "GCZ: Wrong coll branch");

        // Approve WETH to BorrowerOperations
        WETH.approve(address(borrowerOperations), type(uint256).max);
        // Approve coll to BorrowerOperations
        collToken.approve(address(borrowerOperations), type(uint256).max);
        // Approve Coll to exchange module (for closeTroveFromCollateral)
        collToken.approve(address(_exchange), type(uint256).max);
    }

    function _pullColl(uint256 _amount) internal returns (uint256) {
        INrUSDB t = INrUSDB(address(collToken));
        uint256 shares = t.getNrERC20ByStERC20(_amount);
        uint256 wrapAmount = t.getStERC20ByNrERC20(shares);
        stCollToken.safeTransferFrom(msg.sender, address(this), wrapAmount);
        stCollToken.forceApprove(address(collToken), wrapAmount);
        return t.wrap(wrapAmount);
    }

    function _sendColl(address _receiver, uint256 _amount) internal {
        INrUSDB t = INrUSDB(address(collToken));
        uint256 value = t.unwrap(_amount);
        stCollToken.safeTransfer(_receiver, value);
    }

    function openTroveWithRawETH(
        OpenTroveParams calldata _params
    ) external payable returns (uint256) {
        require(msg.value == ETH_GAS_COMPENSATION, "GCZ: Wrong ETH");
        require(
            _params.batchManager == address(0) ||
                _params.annualInterestRate == 0,
            "GCZ: Cannot choose interest if joining a batch"
        );

        // Convert ETH to WETH
        WETH.deposit{value: msg.value}();

        // Pull coll
        uint256 collAmount = _pullColl(_params.collAmount);

        uint256 troveId;
        if (_params.batchManager == address(0)) {
            troveId = borrowerOperations.openTrove(
                _params.owner,
                _params.ownerIndex,
                collAmount,
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
                        collAmount: collAmount,
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

    function addColl(uint256 _troveId, uint256 _amount) external {
        address owner = troveNFT.ownerOf(_troveId);
        _requireSenderIsOwnerOrAddManager(_troveId, owner);

        IBorrowerOperations borrowerOperationsCached = borrowerOperations;

        // Pull coll
        uint256 collAmount = _pullColl(_amount);

        borrowerOperationsCached.addColl(_troveId, collAmount);
    }

    function withdrawColl(uint256 _troveId, uint256 _amount) external {
        address owner = troveNFT.ownerOf(_troveId);
        address receiver = _requireSenderIsOwnerOrRemoveManagerAndGetReceiver(
            _troveId,
            owner
        );

        borrowerOperations.withdrawColl(_troveId, _amount);

        // Send coll left
        _sendColl(receiver, _amount);
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
        _setInitialTokensAndBalances(collToken, boldToken, initialBalances);

        // Pull Bold
        boldToken.transferFrom(msg.sender, address(this), _boldAmount);

        borrowerOperations.repayBold(_troveId, _boldAmount);

        // return leftovers to user
        _returnLeftovers(initialBalances);
    }

    function adjustTrove(
        uint256 _troveId,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _boldChange,
        bool _isDebtIncrease,
        uint256 _maxUpfrontFee
    ) external {
        InitialBalances memory initialBalances;
        (address receiver, uint256 newCollChange) = _adjustTrovePre(
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

    function adjustZombieTrove(
        uint256 _troveId,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _boldChange,
        bool _isDebtIncrease,
        uint256 _upperHint,
        uint256 _lowerHint,
        uint256 _maxUpfrontFee
    ) external {
        InitialBalances memory initialBalances;
        (address receiver, uint256 newCollChange) = _adjustTrovePre(
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
    ) internal returns (address, uint256) {
        address receiver = _checkAdjustTroveManagers(
            _troveId,
            _collChange,
            _isCollIncrease,
            _boldChange,
            _isDebtIncrease
        );

        // Set initial balances to make sure there are not lefovers
        _setInitialTokensAndBalances(collToken, boldToken, _initialBalances);

        // Pull coll
        if (_isCollIncrease) {
            _collChange = _pullColl(_collChange);
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
        address _receiver,
        InitialBalances memory _initialBalances
    ) internal {
        // Send coll left
        if (!_isCollIncrease) {
            _sendColl(_receiver, _collChange);
        }

        // Send Bold
        if (_isDebtIncrease) {
            boldToken.transfer(_receiver, _boldChange);
        }

        // return leftovers to user
        _returnLeftovers(_initialBalances);
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

        // Send coll left
        _sendColl(receiver, trove.entireColl);

        // Send gas compensation
        WETH.withdraw(ETH_GAS_COMPENSATION);
        (bool success, ) = receiver.call{value: ETH_GAS_COMPENSATION}("");
        require(success, "GCZ: Sending ETH failed");
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
