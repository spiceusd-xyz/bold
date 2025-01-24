// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {StdCheats} from "forge-std/StdCheats.sol";
import {IERC20Metadata} from "openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

import {StringFormatting} from "test/Utils/StringFormatting.sol";
import {Accounts} from "test/TestContracts/Accounts.sol";
import {ZERO_ADDRESS, ETH_GAS_COMPENSATION} from "src/Dependencies/Constants.sol";
import {IBorrowerOperations} from "src/Interfaces/IBorrowerOperations.sol";
import "src/AddressesRegistry.sol";
import "src/ActivePool.sol";
import "src/BoldToken.sol";
import "src/BorrowerOperations.sol";
import "src/TroveManager.sol";
import "src/TroveNFT.sol";
import "src/CollSurplusPool.sol";
import "src/DefaultPool.sol";
import "src/GasPool.sol";
import "src/HintHelpers.sol";
import "src/MultiTroveGetter.sol";
import "src/SortedTroves.sol";
import "src/StabilityPool.sol";
import "src/CollateralRegistry.sol";
import "test/TestContracts/MetadataDeployment.sol";
import "src/PriceFeeds/NrPriceFeed.sol";
import "src/PriceFeeds/PythPriceFeed.sol";
import "src/PriceFeeds/SelfHostPriceFeed.sol";
import { USDBZapper } from "src/Zappers/USDBZapper.sol";
import { WETHZapper} from "src/Zappers/WETHZapper.sol";
import "src/Zappers/GasCompZapper.sol";
import "forge-std/console2.sol";

contract DeploySpiceUsdScript is StdCheats, MetadataDeployment {
    using Strings for *;
    using StringFormatting for *;

    address WETH_ADDRESS = 0x4300000000000000000000000000000000000004;
    address USDC_ADDRESS = 0x4300000000000000000000000000000000000003;
    address NR_ETH_ADDRESS = 0x9D020B1697035d9d54f115194c9e04a1e4Eb9aF7;
    address NR_USDC_ADDRESS = 0x96F6b70f8786646E0FF55813621eF4c03823139C;

    IWETH WETH = IWETH(WETH_ADDRESS);

    uint256 STALENESS_THRESHOLD = 24 hours;

    address constant PYTH_ORACLE_ADDRESS = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
    address constant ORACLE_POSTER_ADDRESS = 0xE34dC9DB5F87f1854F687D94FF37db6993ef1441;

    address constant GOVERNANCE_ADDRESS = 0xd3240D8eB011253302E47c9536134Bc44102469b; // TODO: update to multisig

    bytes32 SALT;
    address deployer;

    struct LiquityContracts {
        IAddressesRegistry addressesRegistry;
        IActivePool activePool;
        IBorrowerOperations borrowerOperations;
        ICollSurplusPool collSurplusPool;
        IDefaultPool defaultPool;
        ISortedTroves sortedTroves;
        IStabilityPool stabilityPool;
        ITroveManager troveManager;
        ITroveNFT troveNFT;
        MetadataNFT metadataNFT;
        IPriceFeed priceFeed;
        GasPool gasPool;
        IInterestRouter interestRouter;
        IERC20 collToken;
        address zapper;
    }

    struct LiquityContractAddresses {
        address activePool;
        address borrowerOperations;
        address collSurplusPool;
        address defaultPool;
        address sortedTroves;
        address stabilityPool;
        address troveManager;
        address troveNFT;
        address metadataNFT;
        address priceFeed;
        address gasPool;
        address interestRouter;
    }

    struct TroveManagerParams {
        uint256 CCR;
        uint256 MCR;
        uint256 SCR;
        uint256 LIQUIDATION_PENALTY_SP;
        uint256 LIQUIDATION_PENALTY_REDISTRIBUTION;
    }

    struct DeploymentVars {
        uint256 numCollaterals;
        IERC20Metadata[] collaterals;
        IPriceFeed[] priceFeeds;
        IAddressesRegistry[] addressesRegistries;
        ITroveManager[] troveManagers;
        LiquityContracts contracts;
        bytes bytecode;
        address boldTokenAddress;
        uint256 i;
    }

    struct DeploymentResult {
        LiquityContracts[] contractsArray;
        ICollateralRegistry collateralRegistry;
        IBoldToken boldToken;
        HintHelpers hintHelpers;
        MultiTroveGetter multiTroveGetter;
    }

    function run() external {
        string memory spiceUsd = "SUSD";
        SALT = keccak256(abi.encodePacked(spiceUsd));

        if (vm.envBytes("DEPLOYER").length == 20) {
            // address
            deployer = vm.envAddress("DEPLOYER");
            vm.startBroadcast(deployer);
        } else {
            // private key
            uint256 privateKey = vm.envUint("DEPLOYER");
            deployer = vm.addr(privateKey);
            vm.startBroadcast(privateKey);
        }

        console2.log(deployer, "deployer");
        console2.log(deployer.balance, "deployer balance");

        TroveManagerParams[] memory troveManagerParamsArray = new TroveManagerParams[](6);

        troveManagerParamsArray[0] = TroveManagerParams(131e16, 125e16, 110e16, 5e16, 10e16); // WETH
        troveManagerParamsArray[1] = TroveManagerParams(116e16, 111e16, 105e16, 5e16, 10e16); // USDB
        troveManagerParamsArray[2] = TroveManagerParams(149e16, 142e16, 112e16, 5e16, 10e16); // BLAST
        troveManagerParamsArray[3] = TroveManagerParams(174e16, 166e16, 131e16, 5e16, 10e16); // FNX
        troveManagerParamsArray[4] = TroveManagerParams(174e16, 166e16, 131e16, 5e16, 10e16); // HYPER
        troveManagerParamsArray[5] = TroveManagerParams(131e16, 166e16, 131e16, 5e16, 10e16); // THRUST

        address[] memory collTokens = new address[](6);
        collTokens[0] = NR_ETH_ADDRESS; // NrETH
        collTokens[1] = NR_USDC_ADDRESS; // NrUSDB
        collTokens[2] = 0xb1a5700fA2358173Fe465e6eA4Ff52E36e88E2ad; // BLAST
        collTokens[3] = 0x52f847356b38720B55ee18Cb3e094ca11C85A192; // FNX
        collTokens[4] = 0xEC73284E4EC9bcea1A7DDDf489eAA324C3F7dd31; // HYPER
        collTokens[5] = 0xE36072DD051Ce26261BF50CD966311cab62C596e; // THRUST

        bytes32[] memory priceFeeds = new bytes32[](6);
        // TODO: implement new oracle for nr tokens
        priceFeeds[0] = 0x9d4294bbcd1174d6f2003ec365831e64cc31d9f6f15a2b85399db8d5000960f6; // WETH
        priceFeeds[1] = 0x41283d3f78ccb459a24e5f1f1b9f5a72a415a26ff9ce0391a6878f4cda6b477b; // USDB
        priceFeeds[2] = 0x057345a7e9ef0f36dca8ad1c4e5788808b85f3084cc7b0d8cb29ac5012d88f0d; // BLAST
        priceFeeds[3] = bytes32(0); // FNX
        priceFeeds[4] = bytes32(0); // HYPER
        priceFeeds[5] = bytes32(0); // THRUST


        DeploymentResult memory deployed = _deployAndConnectContracts(troveManagerParamsArray, collTokens, priceFeeds);

        vm.stopBroadcast();

        vm.writeFile("deployment-manifest.json", _getManifestJson(deployed));
    }

    // See: https://solidity-by-example.org/app/create2/
    function getBytecode(bytes memory _creationCode, address _addressesRegistry) public pure returns (bytes memory) {
        return abi.encodePacked(_creationCode, abi.encode(_addressesRegistry));
    }

    function _deployAndConnectContracts(
        TroveManagerParams[] memory _troveManagerParamsArray,
        address[] memory _collTokens,
        bytes32[] memory _priceFeeds
    ) internal returns (DeploymentResult memory r) {
        assert(_collTokens.length == _troveManagerParamsArray.length);

        DeploymentVars memory vars;
        vars.numCollaterals = _troveManagerParamsArray.length;
        // Deploy Bold
        vars.bytecode = abi.encodePacked(type(BoldToken).creationCode, abi.encode(deployer));
        vars.boldTokenAddress = vm.computeCreate2Address(SALT, keccak256(vars.bytecode));
        r.boldToken = new BoldToken{salt: SALT}(deployer);
        assert(address(r.boldToken) == vars.boldTokenAddress);

        r.contractsArray = new LiquityContracts[](vars.numCollaterals);
        vars.collaterals = new IERC20Metadata[](vars.numCollaterals);
        vars.priceFeeds = new IPriceFeed[](vars.numCollaterals);
        vars.addressesRegistries = new IAddressesRegistry[](vars.numCollaterals);
        vars.troveManagers = new ITroveManager[](vars.numCollaterals);

        for (vars.i = 0; vars.i < vars.numCollaterals; vars.i++) {
            vars.collaterals[vars.i] = IERC20Metadata(_collTokens[vars.i]);
            if (_priceFeeds[vars.i] != bytes32(0)) {
                vars.priceFeeds[vars.i] = new PythPriceFeed(deployer, PYTH_ORACLE_ADDRESS, _priceFeeds[vars.i], STALENESS_THRESHOLD);
                if (_collTokens[vars.i] == NR_ETH_ADDRESS || _collTokens[vars.i] == NR_USDC_ADDRESS) {
                    vars.priceFeeds[vars.i] = new NrPriceFeed(vars.priceFeeds[vars.i], INrUSDB(_collTokens[vars.i]));
                }
            } else {
                if (vars.i == 3) {
                    // FNX
                    vars.priceFeeds[vars.i] = SelfHostPriceFeed(0x7b968D8aE7f99DA2c15F016A41336458b981FfDB);
                }
                if (vars.i == 4) {
                    // HYPER
                    vars.priceFeeds[vars.i] = SelfHostPriceFeed(0x4ea4D874dD0F1a1eba9D95853578ccE63D6e2180);
                }
                if (vars.i == 5) {
                    // THRUST
                    vars.priceFeeds[vars.i] = SelfHostPriceFeed(0x43A8E12D7c3Aa0726b373CA5cB9B8565622a6FfB);
                }
            }
        }

        // Deploy AddressesRegistries and get TroveManager addresses
        for (vars.i = 0; vars.i < vars.numCollaterals; vars.i++) {
            (IAddressesRegistry addressesRegistry, address troveManagerAddress) =
                _deployAddressesRegistry(_troveManagerParamsArray[vars.i]);
            vars.addressesRegistries[vars.i] = addressesRegistry;
            vars.troveManagers[vars.i] = ITroveManager(troveManagerAddress);
        }

        r.collateralRegistry = new CollateralRegistry(r.boldToken, vars.collaterals, vars.troveManagers);
        r.hintHelpers = new HintHelpers(r.collateralRegistry);
        r.multiTroveGetter = new MultiTroveGetter(r.collateralRegistry);

        // Deploy per-branch contracts for each branch
        for (vars.i = 0; vars.i < vars.numCollaterals; vars.i++) {
            vars.contracts = _deployAndConnectCollateralContracts(
                vars.collaterals[vars.i],
                vars.priceFeeds[vars.i],
                r.boldToken,
                r.collateralRegistry,
                vars.addressesRegistries[vars.i],
                address(vars.troveManagers[vars.i]),
                r.hintHelpers,
                r.multiTroveGetter
            );
            r.contractsArray[vars.i] = vars.contracts;
        }

        r.boldToken.setCollateralRegistry(address(r.collateralRegistry));
    }

    function _deployAddressesRegistry(TroveManagerParams memory _troveManagerParams)
        internal
        returns (IAddressesRegistry, address)
    {
        IAddressesRegistry addressesRegistry = new AddressesRegistry(
            deployer,
            _troveManagerParams.CCR,
            _troveManagerParams.MCR,
            _troveManagerParams.SCR,
            _troveManagerParams.LIQUIDATION_PENALTY_SP,
            _troveManagerParams.LIQUIDATION_PENALTY_REDISTRIBUTION
        );
        address troveManagerAddress = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(TroveManager).creationCode, address(addressesRegistry)))
        );

        return (addressesRegistry, troveManagerAddress);
    }

    function _deployAndConnectCollateralContracts(
        IERC20Metadata _collToken,
        IPriceFeed _priceFeed,
        IBoldToken _boldToken,
        ICollateralRegistry _collateralRegistry,
        IAddressesRegistry _addressesRegistry,
        address _troveManagerAddress,
        IHintHelpers _hintHelpers,
        IMultiTroveGetter _multiTroveGetter
    ) internal returns (LiquityContracts memory contracts) {
        LiquityContractAddresses memory addresses;
        contracts.collToken = _collToken;

        // Deploy all contracts, using testers for TM and PriceFeed
        contracts.addressesRegistry = _addressesRegistry;

        // Deploy Metadata
        contracts.metadataNFT = deployMetadata(SALT);
        addresses.metadataNFT = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(MetadataNFT).creationCode, address(initializedFixedAssetReader)))
        );
        assert(address(contracts.metadataNFT) == addresses.metadataNFT);

        contracts.priceFeed = _priceFeed;

        contracts.interestRouter = IInterestRouter(GOVERNANCE_ADDRESS);
        addresses.borrowerOperations = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(BorrowerOperations).creationCode, address(contracts.addressesRegistry)))
        );
        addresses.troveManager = _troveManagerAddress;
        addresses.troveNFT = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(TroveNFT).creationCode, address(contracts.addressesRegistry)))
        );
        addresses.stabilityPool = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(StabilityPool).creationCode, address(contracts.addressesRegistry)))
        );
        addresses.activePool = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(ActivePool).creationCode, address(contracts.addressesRegistry)))
        );
        addresses.defaultPool = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(DefaultPool).creationCode, address(contracts.addressesRegistry)))
        );
        addresses.gasPool = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(GasPool).creationCode, address(contracts.addressesRegistry)))
        );
        addresses.collSurplusPool = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(CollSurplusPool).creationCode, address(contracts.addressesRegistry)))
        );
        addresses.sortedTroves = vm.computeCreate2Address(
            SALT, keccak256(getBytecode(type(SortedTroves).creationCode, address(contracts.addressesRegistry)))
        );

        IAddressesRegistry.AddressVars memory addressVars = IAddressesRegistry.AddressVars({
            collToken: _collToken,
            borrowerOperations: IBorrowerOperations(addresses.borrowerOperations),
            troveManager: ITroveManager(addresses.troveManager),
            troveNFT: ITroveNFT(addresses.troveNFT),
            metadataNFT: IMetadataNFT(addresses.metadataNFT),
            stabilityPool: IStabilityPool(addresses.stabilityPool),
            priceFeed: contracts.priceFeed,
            activePool: IActivePool(addresses.activePool),
            defaultPool: IDefaultPool(addresses.defaultPool),
            gasPoolAddress: addresses.gasPool,
            collSurplusPool: ICollSurplusPool(addresses.collSurplusPool),
            sortedTroves: ISortedTroves(addresses.sortedTroves),
            interestRouter: contracts.interestRouter,
            hintHelpers: _hintHelpers,
            multiTroveGetter: _multiTroveGetter,
            collateralRegistry: _collateralRegistry,
            boldToken: _boldToken,
            WETH: WETH
        });

        contracts.addressesRegistry.setAddresses(addressVars);
        contracts.priceFeed.setAddresses(addresses.borrowerOperations);

        contracts.borrowerOperations = new BorrowerOperations{salt: SALT}(contracts.addressesRegistry);
        contracts.troveManager = new TroveManager{salt: SALT}(contracts.addressesRegistry);
        contracts.troveNFT = new TroveNFT{salt: SALT}(contracts.addressesRegistry);
        contracts.stabilityPool = new StabilityPool{salt: SALT}(contracts.addressesRegistry);
        contracts.activePool = new ActivePool{salt: SALT}(contracts.addressesRegistry);
        contracts.defaultPool = new DefaultPool{salt: SALT}(contracts.addressesRegistry);
        contracts.gasPool = new GasPool{salt: SALT}(contracts.addressesRegistry);
        contracts.collSurplusPool = new CollSurplusPool{salt: SALT}(contracts.addressesRegistry);
        contracts.sortedTroves = new SortedTroves{salt: SALT}(contracts.addressesRegistry);

        assert(address(contracts.borrowerOperations) == addresses.borrowerOperations);
        assert(address(contracts.troveManager) == addresses.troveManager);
        assert(address(contracts.troveNFT) == addresses.troveNFT);
        assert(address(contracts.stabilityPool) == addresses.stabilityPool);
        assert(address(contracts.activePool) == addresses.activePool);
        assert(address(contracts.defaultPool) == addresses.defaultPool);
        assert(address(contracts.gasPool) == addresses.gasPool);
        assert(address(contracts.collSurplusPool) == addresses.collSurplusPool);
        assert(address(contracts.sortedTroves) == addresses.sortedTroves);

        // Connect contracts
        _boldToken.setBranchAddresses(
            address(contracts.troveManager),
            address(contracts.stabilityPool),
            address(contracts.borrowerOperations),
            address(contracts.activePool)
        );

        contracts.zapper = _deployZapper(contracts.addressesRegistry);
    }

    function _deployZapper(
        IAddressesRegistry _addressesRegistry
    ) internal returns (address zapper) {
        // _exchange is set to borrowerOperations to avoid approving collToken to unknown contracts or zero address
        if (address(_addressesRegistry.collToken()) == NR_ETH_ADDRESS) {
            zapper = address(new WETHZapper(_addressesRegistry, IFlashLoanProvider(ZERO_ADDRESS), IExchange(address(_addressesRegistry.borrowerOperations()))));
        } else if (address(_addressesRegistry.collToken()) == NR_USDC_ADDRESS) {
            zapper = address(new USDBZapper(_addressesRegistry, IFlashLoanProvider(ZERO_ADDRESS), IExchange(address(_addressesRegistry.borrowerOperations()))));
        } else {
            zapper = address(new GasCompZapper(_addressesRegistry, IFlashLoanProvider(ZERO_ADDRESS), IExchange(address(_addressesRegistry.borrowerOperations()))));
        }
    }

    function formatAmount(uint256 amount, uint256 decimals, uint256 digits) internal pure returns (string memory) {
        if (digits > decimals) {
            digits = decimals;
        }

        uint256 scaled = amount / (10 ** (decimals - digits));
        string memory whole = Strings.toString(scaled / (10 ** digits));

        if (digits == 0) {
            return whole;
        }

        string memory fractional = Strings.toString(scaled % (10 ** digits));
        for (uint256 i = bytes(fractional).length; i < digits; i++) {
            fractional = string.concat("0", fractional);
        }
        return string.concat(whole, ".", fractional);
    }

    function _getBranchContractsJson(LiquityContracts memory c) internal pure returns (string memory) {
        return string.concat(
            "{",
            string.concat(
                // Avoid stack too deep by chunking concats
                string.concat(
                    string.concat('"addressesRegistry":"', address(c.addressesRegistry).toHexString(), '",'),
                    string.concat('"activePool":"', address(c.activePool).toHexString(), '",'),
                    string.concat('"borrowerOperations":"', address(c.borrowerOperations).toHexString(), '",'),
                    string.concat('"collSurplusPool":"', address(c.collSurplusPool).toHexString(), '",'),
                    string.concat('"defaultPool":"', address(c.defaultPool).toHexString(), '",'),
                    string.concat('"sortedTroves":"', address(c.sortedTroves).toHexString(), '",'),
                    string.concat('"stabilityPool":"', address(c.stabilityPool).toHexString(), '",'),
                    string.concat('"troveManager":"', address(c.troveManager).toHexString(), '",')
                ),
                string.concat(
                    string.concat('"troveNFT":"', address(c.troveNFT).toHexString(), '",'),
                    string.concat('"metadataNFT":"', address(c.metadataNFT).toHexString(), '",'),
                    string.concat('"priceFeed":"', address(c.priceFeed).toHexString(), '",'),
                    string.concat('"gasPool":"', address(c.gasPool).toHexString(), '",'),
                    string.concat('"interestRouter":"', address(c.interestRouter).toHexString(), '",'),
                    string.concat('"zapper":"', address(c.zapper).toHexString(), '",')
                ),
                string.concat(
                    string.concat('"collToken":"', address(c.collToken).toHexString(), '"') // no comma
                )
            ),
            "}"
        );
    }

    function _getDeploymentConstants() internal pure returns (string memory) {
        return string.concat(
            "{",
            string.concat(
                string.concat('"ETH_GAS_COMPENSATION":"', ETH_GAS_COMPENSATION.toString(), '",'),
                string.concat('"INTEREST_RATE_ADJ_COOLDOWN":"', INTEREST_RATE_ADJ_COOLDOWN.toString(), '",'),
                string.concat('"MAX_ANNUAL_INTEREST_RATE":"', MAX_ANNUAL_INTEREST_RATE.toString(), '",'),
                string.concat('"MIN_ANNUAL_INTEREST_RATE":"', MIN_ANNUAL_INTEREST_RATE.toString(), '",'),
                string.concat('"MIN_DEBT":"', MIN_DEBT.toString(), '",'),
                string.concat('"SP_YIELD_SPLIT":"', SP_YIELD_SPLIT.toString(), '",'),
                string.concat('"UPFRONT_INTEREST_PERIOD":"', UPFRONT_INTEREST_PERIOD.toString(), '"') // no comma
            ),
            "}"
        );
    }

    function _getManifestJson(DeploymentResult memory deployed)
        internal
        pure
        returns (string memory)
    {
        string[] memory branches = new string[](deployed.contractsArray.length);

        // Poor man's .map()
        for (uint256 i = 0; i < branches.length; ++i) {
            branches[i] = _getBranchContractsJson(deployed.contractsArray[i]);
        }

        return string.concat(
            "{",
            string.concat(
                string.concat('"constants":', _getDeploymentConstants(), ","),
                string.concat('"collateralRegistry":"', address(deployed.collateralRegistry).toHexString(), '",'),
                string.concat('"boldToken":"', address(deployed.boldToken).toHexString(), '",'),
                string.concat('"hintHelpers":"', address(deployed.hintHelpers).toHexString(), '",'),
                string.concat('"multiTroveGetter":"', address(deployed.multiTroveGetter).toHexString(), '",'),
                string.concat('"branches":[', branches.join(","), "],")
            ),
            "}"
        );
    }
}
