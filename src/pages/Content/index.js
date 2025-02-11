import { num } from '../../../server/fragments';
import { cashtag_regex, formatVolume, stripSocials } from '../../../utils';
import {
  ACCOUNT_KEY,
  CLASS_FOR_TAG,
  MS_GET_TOKEN_INFO,
  STORAGE_KEY,
} from '../../../utils/constant';
import { createChartNode } from './Chart';
import { Networks } from './Networks';
import {
  createImage,
  createLink,
  createSpan,
  mergeToDiv,
} from './CreateElements';
import { addPortfolio, removePortfolio } from './Portfolio';
import { TradeModal } from './TradeModal';

const dataMap = new Map();

const fontColor = '#888';

console.log('content');

const onMutation = (mutations) => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node) {
        if (node.dataset && node.dataset.testid) {
          if (node.dataset.testid === 'cellInnerDiv') {
            fetchAndAttach(node);
          }
        }
      }
    }
  }
  return true;
};

const mo = new MutationObserver(onMutation);
const startProcess = () => {
  mo.observe(document, {
    subtree: true,
    childList: true,
  });
};

const stopProcess = () => {
  mo.disconnect();
  const tags = document.querySelectorAll(`.${CLASS_FOR_TAG}`);
  tags.forEach((tag) => tag.remove());
};

const fetchAndAttach = async (node) => {
  console.log('fetchAndAttach');

  const cashtags = getTweetCashtags(node);
  const newCashTags = cashtags.filter((cashtag) => !dataMap.has(cashtag));

  try {
    if (newCashTags.length > 0) {
      await getTokensInfo(newCashTags);
    }
    attachInfoTag(node);
  } catch (error) {
    console.log('error getting tokens info: ', error.message);
  }
};

const getTweetCashtags = (node) => {
  try {
    const tweets = node.querySelectorAll("[data-testid='tweetText']");
    const linkUrls = Array.from(tweets)
      .map((content) =>
        Array.from(content.querySelectorAll('a'))
          .map((element) => element.href)
          .filter((url) => cashtag_regex.test(url))
      )
      .flat();

    return FromLinksToCashtags(linkUrls);
  } catch (error) {
    console.log('Tweets lookup error: ', error.message || "Can't find tweets");
    return [];
  }
};

const FromLinksToCashtags = (urls) => {
  const uniqueCashTags = new Set();

  for (let url of urls) {
    let [i1, i2] = [url.indexOf('%24'), url.indexOf('&src')];
    let token = url.slice(i1 + 3, i2);
    if (token.length >= 3 && token.length <= 5) {
      uniqueCashTags.add(token.toUpperCase());
    }
  }

  return Array.from(uniqueCashTags);
};

const setTokensInfo = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return;
  }
  data.forEach((value) => {
    dataMap.set(value.symbol, value);
  }, {});
};

const getTokensInfo = async (cashtags) => {
  return new Promise((resolve, reject) => {
    const msg = {
      action: MS_GET_TOKEN_INFO,
      cashtags,
    };
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        setTokensInfo(response);
        resolve('ok');
      }
    });
  });
};

function attachInfoTag(node) {
  const selectedTweets = node.querySelectorAll("[data-testid='tweetText']");
  for (let selectedTweetTag of selectedTweets) {
    const children = selectedTweetTag.children;
    const cashtag_spans = Array.from(children).filter(
      (child) => Array.from(child.classList).length === 1
    );
    for (let cashtag_span of cashtag_spans) {
      let cashtag = cashtag_span.textContent.replace('$', '').toUpperCase();
      const matchedTag = dataMap.get(cashtag);
      const checkLastTag = selectedTweetTag.querySelector(`.${CLASS_FOR_TAG}`);
      if (matchedTag) {
        if (checkLastTag) {
          checkLastTag.remove();
        }
        const newDiv = createInfo(matchedTag);
        const firstChild = selectedTweetTag.firstChild;
        selectedTweetTag.insertBefore(newDiv, firstChild);
        cashtag_span.addEventListener('mouseover', () => {
          const recentTag = selectedTweetTag.querySelector(`.${CLASS_FOR_TAG}`);
          if (recentTag) {
            recentTag.remove();
          }
          const _firstChild = selectedTweetTag.firstChild;
          selectedTweetTag.insertBefore(newDiv, _firstChild);
        });
      }
    }
  }
}

function createInfo(tokenInfo) {
  const newDiv = document.createElement('div');

  let {
    twitter,
    symbol,
    imageThumbUrl,
    priceChange,
    volume,
    address,
    networkId,
    price,
    bar,
  } = tokenInfo;

  newDiv.classList.add(CLASS_FOR_TAG);
  newDiv.id = symbol;
  newDiv.style.display = 'flex';
  newDiv.style.alignItems = 'center';
  newDiv.style.justifyContent = 'space-between';
  newDiv.style.backgroundColor = '#fff';
  newDiv.style.gap = '6px';
  newDiv.style.fontFamily = 'TwitterChirp';
  newDiv.style.border = '1px solid #d2d2d2';
  newDiv.style.borderRadius = '4px';
  newDiv.style.padding = '4px 8px';
  newDiv.style.margin = '4px 0px';
  newDiv.style.fontSize = '12px';
  newDiv.style.position = 'relative';
  newDiv.style.color = fontColor;

  // Image and Symbol
  const imageNode = createImage(imageThumbUrl, symbol);
  const symbolNode = createSpan(symbol);
  const imageSymbolNode = mergeToDiv(imageNode, symbolNode);

  // Price, 24H Change and Volume
  const priceNode = createSpan(`${price}`, true);
  const priceChangeNode = createSpan(`📈 ${num(priceChange).toFixed(2)}%`);
  const volumeNode = createSpan(`💹 $${formatVolume(volume)}`);

  // Chart and Buy/Sell
  const chartNode = createChartNode(bar, newDiv);
  const viewChartNode = createSpan('📊 Chart');
  viewChartNode.addEventListener('mouseover', () => {
    chartNode.style.display = 'block';
    chartNode.style.top = newDiv.offsetHeight + 'px';
    chartNode.style.width = newDiv.offsetWidth + 'px';
  });
  viewChartNode.addEventListener('mouseout', () => {
    setTimeout(() => {
      chartNode.style.display = 'none';
    }, 5000);
  });
  const viewTradeModal = createSpan('💱 Trade');
  viewTradeModal.addEventListener('click', () => {
    const modal = TradeModal();
    document.body.appendChild(modal);
  });

  // Address and Link
  const network = Networks.find((network) => network.id === networkId).name;
  const addressShort = `⛓️${address.substring(0, 4)}...${address.slice(-3)}`;
  const addressLink = createLink(
    `https://www.defined.fi/${network}/${address}`
  );
  const addressNode = createSpan(addressShort);
  addressLink.appendChild(addressNode);

  newDiv.appendChild(imageSymbolNode);
  newDiv.appendChild(priceNode);
  newDiv.appendChild(priceChangeNode);
  newDiv.appendChild(volumeNode);
  newDiv.appendChild(addressLink);

  // Socials
  if (twitter) {
    const twitterLink = createLink(twitter);
    const twitterNode = createSpan(`🐦 @${stripSocials(twitter)}`);
    twitterLink.appendChild(twitterNode);
    newDiv.appendChild(twitterLink);
  }
  newDiv.appendChild(viewChartNode);
  newDiv.appendChild(viewTradeModal);
  newDiv.appendChild(chartNode);

  return newDiv;
}

chrome.storage.local.get(STORAGE_KEY).then((values) => {
  if (values.hasOwnProperty(STORAGE_KEY) && values[STORAGE_KEY]) {
    setTimeout(startProcess, 300);
  }
});
chrome.storage.local.get(ACCOUNT_KEY).then((values) => {
  if (values.hasOwnProperty(ACCOUNT_KEY) && values[ACCOUNT_KEY]) {
    const account = values[ACCOUNT_KEY];
    if (account.isConnected && account.account) {
      addPortfolio(account.account);
    }
  }
});

chrome.storage.onChanged.addListener(function (changes, namespace) {
  console.log(changes, namespace);
  for (let key in changes) {
    if (key === STORAGE_KEY) {
      const newValue = changes[key].newValue;
      if (newValue) {
        console.log('start interval');
        startProcess();
      } else {
        console.log('stop interval');
        stopProcess();
      }
    }
    if (key === ACCOUNT_KEY) {
      const newValue = changes[key].newValue;
      if (newValue.isConnected && newValue.account) {
        console.log('portfolio in');
        addPortfolio(newValue.account);
      } else {
        console.log('remove portfolio');
        removePortfolio();
      }
    }
  }
});

window.onload = function () {
  chrome.runtime.sendMessage(
    { action: 'content_script_ready' },
    function (response) {
      console.log('window.onload');
    }
  );
};
