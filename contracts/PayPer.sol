// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PayPer
/// @notice x402-style pay-per-use gating on Monad.
/// A creator registers a resource with a price (in wei/MON) and a content hash.
/// Any user can pay exactly that price; the contract records (resourceId => payer => true)
/// so the off-chain app releases the content to that payer only.
contract PayPer {
    struct Resource {
        address creator;
        uint256 price;      // price in wei (MON)
        bytes32 contentHash;// keccak256 of the gated content (off-chain stored)
        string uri;         // pointer to off-chain content (ipfs://... or https://...)
        bool active;
        uint256 totalEarned;
        uint256 accessCount;
    }

    address public owner;
    uint256 public nextId;
    mapping(uint256 => Resource) public resources;

    // resourceId => payer => hasPaid
    mapping(uint256 => mapping(address => bool)) public unlocked;

    event ResourceCreated(
        uint256 indexed id,
        address indexed creator,
        uint256 price,
        bytes32 contentHash,
        string uri
    );
    event AccessPaid(
        uint256 indexed id,
        address indexed payer,
        uint256 amount,
        uint256 accessCount
    );
    event ResourceDeactivated(uint256 indexed id);

    error NotEnough();
    error AlreadyUnlocked();
    error ResourceInactive();
    error NotCreator();

    constructor() {
        owner = msg.sender;
        nextId = 1;
    }

    /// @notice Creator registers a gated resource.
    function createResource(
        uint256 price,
        bytes32 contentHash,
        string calldata uri
    ) external returns (uint256 id) {
        require(price > 0, "price must be > 0");
        id = nextId++;
        resources[id] = Resource({
            creator: msg.sender,
            price: price,
            contentHash: contentHash,
            uri: uri,
            active: true,
            totalEarned: 0,
            accessCount: 0
        });
        emit ResourceCreated(id, msg.sender, price, contentHash, uri);
    }

    /// @notice Payer unlocks a resource by sending exactly `price` MON.
    function payForAccess(uint256 id) external payable returns (bool) {
        Resource storage r = resources[id];
        if (!r.active) revert ResourceInactive();
        if (unlocked[id][msg.sender]) revert AlreadyUnlocked();
        if (msg.value != r.price) revert NotEnough();

        unlocked[id][msg.sender] = true;
        r.totalEarned += msg.value;
        r.accessCount += 1;

        // Forward payment to creator
        (bool ok, ) = payable(r.creator).call{value: msg.value}("");
        require(ok, "transfer failed");

        emit AccessPaid(id, msg.sender, msg.value, r.accessCount);
        return true;
    }

    /// @notice Check if an address already unlocked a resource.
    function hasAccess(uint256 id, address who) external view returns (bool) {
        return unlocked[id][who];
    }

    /// @notice Creator can deactivate a resource (stops new payments).
    function deactivate(uint256 id) external {
        Resource storage r = resources[id];
        if (msg.sender != r.creator) revert NotCreator();
        r.active = false;
        emit ResourceDeactivated(id);
    }

    /// @notice Withdraw accumulated tips/sales (owner only, safety valve).
    function withdraw() external {
        require(msg.sender == owner, "owner only");
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok, "transfer failed");
    }
}
