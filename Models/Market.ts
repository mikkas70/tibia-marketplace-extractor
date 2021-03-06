import {dragMouse, mouseClick, keyTap} from "@nut-tree/libnut";
import {getCroppedImage} from "../helpers/screenshot";
import delay from "../helpers/delay";
import ITEMS from "../constants/items";
import humanWrite from "../helpers/humanWrite";
import Tibia from "./Tibia";
import * as fs from "fs";
import {IMarketStructure} from "../interfaces/marketStructure";
import {sanitizePrice} from "../helpers/price";
import rmdir from 'rimraf';
import {ensureDirectoryExists} from "../helpers/filesystem";
import FOLDERS from "../constants/folders";
import textract from 'textract';
import APIService from "../services/APIService";

export default class Market {
    private timestamp: number;
    private currentItem: string;
    private hasFinishedParsing = false;
    private offersPerItem: number = Number(process.env.MARKET_OFFERS_PER_ITEM);
    private offerPriceHeight: number = Number(process.env.MARKET_OFFER_PRICE_HEIGHT);
    private offerPriceWidth: number = Number(process.env.MARKET_OFFER_PRICE_WIDTH);
    private API = new APIService();

    constructor() {
        const world = Tibia.getInstance().getWorld();

        this.timestamp = Date.now();

        ensureDirectoryExists(process.env.IMAGES_FOLDER + '/' + world + '/' + FOLDERS.MARKET_OFFER_BUYING);
        ensureDirectoryExists(process.env.IMAGES_FOLDER + '/' + world + '/' + FOLDERS.MARKET_OFFER_SELLING);
        ensureDirectoryExists(process.env.MARKET_OFFERS_JSON_FOLDER + '/' + world);
    }

    /**
     * Extract item information from the marketplace
     * @return void
     */
    startExtraction = async () => {
        await this.API.getMarketableItems().then(async items => {
            for (const itemName of ITEMS) {
                this.currentItem = itemName;

                await this.searchItem(itemName);
                await this.selectSearchedItem();

                this.getSellOffersImage();
                this.getBuyOffersImage();

                await this.clearSearch();
            }
        })
    }

    /**
     * Parse all market data and return parsed data.
     * @return Promise<IMarketStructure>
     */
    parseMarketData = async (): Promise<IMarketStructure> => {
        const world = Tibia.getInstance().getWorld();
        const data: IMarketStructure = {
            offers: [],
        };

        for (const [index, itemName] of ITEMS.entries()) {
            if (!fs.existsSync('images/' + world + '/' + FOLDERS.MARKET_OFFER_BUYING + '/' + itemName + '.png') ||
                !fs.existsSync('images/' + world + '/' + FOLDERS.MARKET_OFFER_SELLING + '/' + itemName + '.png')) {
                continue;
            }

            textract.fromFileWithPath('images/' + world + '/' + FOLDERS.MARKET_OFFER_BUYING + '/' + itemName + '.png', async (error, buyingResult) => {
                textract.fromFileWithPath('images/' + world + '/' + FOLDERS.MARKET_OFFER_SELLING + '/' + itemName + '.png', (error, sellingResult) => {
                    const buying = buyingResult.split(' ');
                    const selling = sellingResult.split(' ');

                    const buyOffers = buying.map((price): number | undefined => sanitizePrice(price)).filter((price) => price !== undefined);
                    const sellOffers = selling.map((price): number | undefined => sanitizePrice(price)).filter((price) => price !== undefined);

                    data.offers.push({
                        itemName: itemName,
                        buyOffers: buyOffers,
                        sellOffers: sellOffers
                    });

                    if (index + 1 === ITEMS.length) {
                        this.hasFinishedParsing = true;
                    }
                });
            });
        }

        while (!this.hasFinishedParsing) {
            await delay(200);
        }

        return Promise.resolve(data);
    }

    /**
     * Save all market data into a JSON file.
     * @param data
     * @return Promise<boolean>
     */
    saveMarketData = (data: IMarketStructure): Promise<boolean> => {
        const world = Tibia.getInstance().getWorld();

        fs.writeFile(process.env.MARKET_OFFERS_JSON_FOLDER + '/' + world + '/' + this.timestamp + '.json', JSON.stringify(data),(err) => {
            if (err) {
                console.log('Could not save market offers', err);
            }
        });

        return Promise.resolve(true);
    }

    /**
     * Clean everything that is not needed.
     * @return void
     */
    cleanup = () => {
        const world = Tibia.getInstance().getWorld();

        rmdir(process.env.IMAGES_FOLDER + '/' + world, err => {
            console.log('Something went wrong while trying to delete the images folder.');
        });
    }

    private getTransactionType = (path: string) => {
        if (path.indexOf(FOLDERS.MARKET_OFFER_BUYING)) return FOLDERS.MARKET_OFFER_BUYING;
    }

    /**
     * Search item on the Market
     * @param itemName
     * @return void
     */
    private searchItem = async (itemName: string) => {
        dragMouse(Number(process.env.MARKET_SEARCH_COORDINATES_X), Number(process.env.MARKET_SEARCH_COORDINATES_Y));
        await delay(100);
        mouseClick();
        await delay(100);
        await humanWrite(itemName);
    }

    /**
     * Clear market search
     * @return void
     */
    private clearSearch = async () => {
        dragMouse(Number(process.env.MARKET_CLEAR_SEARCH_COORDINATES_X), Number(process.env.MARKET_CLEAR_SEARCH_COORDINATES_Y));
        await delay(250);
        mouseClick();
        await delay(250);
    }

    /**
     * Select searched item (always first position)
     * @return void
     */
    private selectSearchedItem = async () => {
        dragMouse(Number(process.env.MARKET_ITEM_POSITION_1_COORDINATES_X), Number(process.env.MARKET_ITEM_POSITION_1_COORDINATES_Y));
        await delay(250);
        mouseClick();
        await delay(1000);
    }

    private getSellOffersImage = () => {
        getCroppedImage(
            'images/' + Tibia.getInstance().getWorld() + '/' + FOLDERS.MARKET_OFFER_SELLING + '/' + this.currentItem + '.png',
            Number(process.env.MARKET_SELL_OFFERS_START_COORDINATES_X),
            Number(process.env.MARKET_SELL_OFFERS_START_COORDINATES_Y),
            Number(process.env.MARKET_SELL_OFFERS_START_COORDINATES_X) + this.offerPriceWidth,
            Number(process.env.MARKET_SELL_OFFERS_START_COORDINATES_Y) + (this.offersPerItem * this.offerPriceHeight)
        )
    }

    private getBuyOffersImage = () => {
        getCroppedImage(
            'images/' + Tibia.getInstance().getWorld() + '/' + FOLDERS.MARKET_OFFER_BUYING + '/' + this.currentItem + '.png',
            Number(process.env.MARKET_BUY_OFFERS_START_COORDINATES_X),
            Number(process.env.MARKET_BUY_OFFERS_START_COORDINATES_Y),
            Number(process.env.MARKET_BUY_OFFERS_START_COORDINATES_X) + this.offerPriceWidth,
            Number(process.env.MARKET_BUY_OFFERS_START_COORDINATES_Y) + (this.offersPerItem * this.offerPriceHeight)
        )
    }
}
