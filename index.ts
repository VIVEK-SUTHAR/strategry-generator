import express from "express";
import fs from "fs";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  parseEther,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { execSync } from "child_process";

const app = express();
app.use(express.json());

app.post("/deploy", async (req, res) => {
  try {
    const {
      baseTokenAddress,
      destinationTokenAddress,
      routerAddress,
      poolProviderAddress,
    } = req.body;

    if (
      !baseTokenAddress ||
      !destinationTokenAddress ||
      !routerAddress ||
      !poolProviderAddress
    ) {
      res.status(400).json({ error: "Missing required parameters" });
      return;
    }

    const contractPath = "./contracts/AaveLoopStrategy.sol";
    let contractCode = fs.readFileSync(contractPath, "utf8");

    contractCode = contractCode
      .replace(
        /address public constant WETH = .+;/,
        `address public constant WETH = ${baseTokenAddress};`
      )
      .replace(
        /address public constant USDC = .+;/,
        `address public constant USDC = ${destinationTokenAddress};`
      )
      .replace(
        /address public constant UNISWAP_ROUTER = .+;/,
        `address public constant UNISWAP_ROUTER = ${routerAddress};`
      )
      .replace(
        /address public constant POOL_ADDRESSES_PROVIDER = .+;/,
        `address public constant POOL_ADDRESSES_PROVIDER = ${poolProviderAddress};`
      );

    const modifiedPath = "./contracts/ModifiedAaveLoopStrategy.sol";
    fs.writeFileSync(modifiedPath, contractCode);

    console.log("Compiling the contract using Hardhat...");
    execSync("npx hardhat compile", { stdio: "inherit" });

    const compiledPath =
      "./artifacts/contracts/ModifiedAaveLoopStrategy.sol/AaveLoopStrategy.json";
    if (!fs.existsSync(compiledPath)) {
      throw new Error("compile fail");
    }

    const compiledContract = JSON.parse(fs.readFileSync(compiledPath, "utf8"));
    const abi = compiledContract.abi;
    const bytecode = compiledContract.bytecode;

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("No PRIVATE_KEY set");
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const rpcUrl = process.env.RPC_URL || "https://rpc.sepolia.org";
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      chain: baseSepolia,
      account,
      transport: http(rpcUrl),
    });

    console.log("Deploying the contract...");
    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: [],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const contractAddress = receipt.contractAddress;

    console.log(`Contract deployed at address: ${contractAddress}`);
    res.json({ address: contractAddress });
  } catch (error) {
    console.error("Deployment failed:", error);
    res
      .status(500)
      .json({ error: "Deployment failed", details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
