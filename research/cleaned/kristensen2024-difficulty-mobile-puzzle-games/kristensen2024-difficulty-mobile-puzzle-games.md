---
title: "Difficulty Modelling in Mobile Puzzle Games: An Empirical Study on Different Methods to Combine Player Analytics and Simulated Data"
authors: ["Jeppe Theiss Kristensen", "Paolo Burelli"]
year: 2024
venue: "International Journal of Computer Games Technology, vol. 2024, Article ID 5592373, 14 pages (Wiley/Hindawi)"
doi: "10.1155/2024/5592373"
source_url: "https://doi.org/10.1155/2024/5592373"
raw_path: "research/raw/papers/kristensen2024-difficulty-mobile-puzzle-games.pdf"
license: "CC BY 4.0 (open access, Creative Commons Attribution License)"
relevance: |
  Difficulty = average attempts per completion, predicted per player and per cohort for a live
  match/blast puzzle game (Lily's Garden). Key result for us: on unreleased (cold-start) levels only
  models that include simulated playtest-agent statistics beat a constant-mean baseline; agent
  features (min game length, completion rate) were 5-6x more important than static level features.
  Suggests: solver/simulated-player statistics should drive our difficulty estimate, with human data
  as a later calibration layer. Not about state-space search or generation itself.
---

# Difficulty Modelling in Mobile Puzzle Games: An Empirical Study on Different Methods to Combine Player Analytics and Simulated Data

*Research Article.* Jeppe Theiss Kristensen (A.P. Moller-Maersk, Copenhagen, Denmark) and Paolo Burelli (IT University of Copenhagen, Copenhagen, Denmark). Correspondence: Paolo Burelli, pabu@itu.dk.

Received 29 January 2024; Revised 26 April 2024; Accepted 10 May 2024. Academic Editor: Davide Gadia.

Copyright © 2024 Jeppe Theiss Kristensen and Paolo Burelli. This is an open access article distributed under the Creative Commons Attribution License, which permits unrestricted use, distribution, and reproduction in any medium, provided the original work is properly cited.

## Abstract

Difficulty is one of the key drivers of player engagement, and it is often one of the aspects that designers tweak most to optimise the player experience; operationalising it is, therefore, a crucial task for game development studios. A common practice consists of creating metrics out of data collected by player interactions with the content; however, this allows for estimation only after the content is released and does not consider the characteristics of potential future players. In this article, we present a number of potential solutions for the estimation of difficulty under such conditions, and we showcase the results of a comparative study intended to understand which method and which types of data perform better in different scenarios. The results reveal that models trained on a combination of cohort statistics and simulated data produce the most accurate estimations of difficulty in all scenarios. Furthermore, among these models, artificial neural networks show the most consistent results.

## 1. Introduction

Among the many characteristics of a game that affect the player experience, difficulty is generally considered to be one of the most impactful. As theorised by Csikszentmihalyi regarding the concept of *flow* [1], if the game is too easy, players risk not feeling challenged, becoming bored, and potentially quitting the game. On the other hand, in case it is too hard, players might feel stuck, become frustrated, and again, potentially quit the game. Therefore, it is not surprising that an important focus for many game studios is to be able to estimate the difficulty of game content.

Difficulty estimation is particularly important for live-operated games, which is currently the largest market in the game industry [2–4] since new content is constantly produced and old content is updated to fit the demand of the players. Ensuring players *stay* engaged in the game is crucial for these games to be commercially successful, which puts pressure on game studios to have content that is adequately challenging for new players to pique their interest and also to release new content for more experienced users that can keep the game experience fresh and exciting. The challenge for any difficulty prediction framework is therefore twofold: not only should it work on previously released content where rich information about other players is available, but also on novel content where player data is more sparse or nonexistent. Furthermore, as difficulty is a concept that emerges from the interaction between players and content, the estimation is going to be affected not only by the content type but also by the target player or cohort of players.

As a first step in the process of building a difficulty modelling framework, it is necessary to operationalise difficulty so that it can be quantified and measured. A common gameplay element in many puzzle games is the existence of discrete tasks or levels. A direct way to quantify the difficulty of a level is by using the average number of attempts the players require to complete the level. This metric has been linked to player churn, and it gives the level designers a clear measure of how much time players are expected to spend on the challenges. However, the measurement very much depends on the players that have played at the level at the time of measurement. This perceived difficulty can vary depending on the cohorts of players and their skill, so using this average metric for all players can be misleading and does not fully inform the level designers about the intrinsic difficulty of the level [5].

Another challenge for difficulty estimation is the complexity of the gameplay. Some aspects of a puzzle, such as winning strategies or "traps," may not be immediately apparent through a static analysis of the level. While it may be possible to infer the level's complexity using data collected from previous players' performances on existing content, this is not possible for new content. Instead, it normally takes multiple level designers to manually playtest the content to overcome this cold-start problem, which can be an expensive and time-consuming process. This limits the volume of new content and also the quality due to the level of the designers' own skills and biases. A framework for difficulty prediction can therefore benefit from a component that can explore the dynamics of the game to determine the intrinsic difficulty but also possibly model how individual players respond to the intrinsic difficulty.

A model capable of estimating perceived difficulty in these different scenarios has multiple potential applications: it could be employed to give immediate feedback to designers when working on new puzzles, it could be used to guide a procedural content generation algorithm intended to create content at a specific level of difficulty, or it could be used to adapt content so that it would provide a specific level of challenge to a specific player or cohort.

With these challenges and applications in mind, in this research work, we investigate various difficulty modelling frameworks that can address some of the issues and shortcomings that previous approaches have revealed. The two main research questions we aim to answer are as follows:

- **RQ1:** Is it possible to accurately estimate the perceived difficulty of a puzzle for a specific player? What combination of model and data is most effective at this task?
- **RQ2:** Is it possible to accurately estimate the perceived difficulty of a puzzle for a specific cohort of players? Can we use the same models and methods developed for personalised predictions? What combination of model and data is most effective at this task?

On the one hand, with the first research question (RQ1), our aim is to investigate personalised models of difficulty that can be used for adaptive gameplay. On the other hand, with the second research question (RQ2), we aim to investigate models that are suitable for either cohort-level adaptation or to support procedural content generation and manual content design.

To answer these two questions, we designed two experiments in which we break the questions down and explore how different difficulty prediction methods work in various scenarios. Using data from a commercial puzzle game, we investigate the impact of using different types of data, methods, and granularity for difficulty prediction, which contributes to the body of knowledge for developing a complete and feasible framework for both personalised and cohort difficulty predictions. While the research builds on results from a puzzle game, the methods and results have the potential to be extended to other types of games with similar characteristics—i.e., linear progression and discrete repeatable challenges—that can help game studios and researchers alike build a more comprehensive model of difficulty in games.

## 2. Related Work

Difficulty modelling and prediction can be approached in many different ways, depending on the use case. In this paper, we root our analysis in the practical application of modelling difficulty in a commercial context in which both the player population and the game experience change constantly. To properly analyse a framework that can work in such a context, we first discuss the definition of difficulty and give an overview of how it has previously been modelled in various contexts. In addition to that, we also examine how various playtesting methods have been used for evaluating new content and relate that to the approach presented in this paper.

### 2.1. Predicting Difficulty

For any measurement of difficulty to be meaningful, it must reflect the experience of the players. However, there can be multiple aspects that can change this perception, including uncertainty and the skill of the player [6]. Therefore, it is highly individual how challenging a player finds a puzzle, so a useful notion is perceived difficulty, where the difficulty is described as a relational attribute between the game and the player [5, 7]. The importance of the individual perception of difficulty can be understood through the lens of flow, a state where the player loses track of time and worries [1, 8]. To reach this state, the presented difficulty of a task should be optimal in terms of player skill, which means that it should satisfy the players' intrinsic needs to feel competent and lead to an engaging game experience [9–11]. With flow and intrinsic motivation being major contributors to player engagement [12], a core design object of the difficulty prediction framework is, therefore, to account for individual or cohort differences.

Pusey et al. [13] describe a number of measurable metrics for puzzle games that quantify difficulty, including the number of actions and time taken to complete a puzzle, as well as the number of incorrect attempts. Indeed, using the average number of attempts players spend to complete the level, or inversely the pass rate, is a common way to operationalise difficulty in puzzle games (e.g., in Angry Birds [14], Lily's Garden [15], and Candy Crush [16]). As noted by Denisova et al. [6], the perceived difficulty of the player is strongly related to the number of successes and failures; therefore, in this article, we adopt a similar definition of difficulty as the number of attempts to complete a given level.

The objective of predicting the number of attempts has been approached in a number of different ways and with different applications. One use case is dynamic difficulty adjustment (DDA) [17, 18], where the game content is adjusted so that the perceived difficulty of a player follows an optimal or predefined goal. Gonzalez-Duque et al. [19] consider recent play history and use Bayesian methods for estimating how much time a player requires to complete a Sudoku puzzle or platform level. A more direct approach is presented by Xue et al. [20], who employ the pass rate associated with different random seeds for each level to serve personalised content. Deep learning methods have also been used to model players and optimise difficulty and engagement [21, 22].

Although DDA has the promise of increasing engagement [23, 24], not all games are designed with this kind of dynamic adjustment in mind, and designers instead find it sufficient with more ad hoc or daily predictions. For this purpose, parametric-based approaches have been applied for estimating the probability of success [25–27]. An example is the work by Wheat et al. [28], where four categories of data (e.g., level features and player behaviour) are considered. In this work, a random forest classifier had the best accuracy when predicting how difficult each player perceived levels in a custom platform game. However, in more complex games with large, diverse player bases, these parametric approaches may not be able to fully capture the complex interrelationship between players and levels, leading to limited applicability. Matrix factorisation methods, known from recommendation systems and their ability to deal with sparse data, have been used specifically to predict the perceived difficulty of each player in games [5, 29].

In this work, we build on the prediction methods from Kristensen et al. [5] by extending the analysis in two ways. The main problem is that matrix factorisation methods suffer from a cold-start problem where new players or levels cannot be included during training. This leads to the model not learning a latent representation of the new users and levels, which makes predictions for new content impossible. To address this, we experiment with including different categories of data, similar to Wheat et al. [28], in addition to testing both a neural network and a random forest model for difficulty prediction.

### 2.2. Playtesting Agents

Although player data and level data have been used for estimating the difficulty of levels, these categories of data do not include any kind of dynamic information about the levels and are bound to be only an approximation of the gameplay. It is therefore necessary to extract data from playing through the level, and with the complexity of games today, more intelligent solutions than simple heuristic-based methods are increasingly necessary. The methods have also become mature enough to assist the whole game design process, ranging from finding bugs, edge cases, and general playability [30–33] to modelling players and adjusting difficulty [14, 15, 34–36].

In the specific case of puzzle games, (deep) reinforcement learning- (RL-) and Monte-Carlo tree search- (MCTS-) based approaches are among the most commonly used to estimate the difficulty of levels [16, 37–41]. In one of the most recent examples, Kristensen and Burelli [37] use an implementation of the RL method proximal policy optimisation (PPO) [42] to develop an agent capable of playing through puzzle levels in the commercial puzzle game Lily's Garden. Further work showed that despite the agent performing subpar compared to human players, the agent's performance is strongly correlated to actual player performance [15]. As noted by Zhao et al. [43], the goal of creating playtesting agents is not necessarily to outperform humans but rather to capture facets of the gameplay related to skill and style that can be related to player behaviour. With a similar perspective, Gudmundsson et al. [16] demonstrated that by postprocessing the statistics produced by an agent playing a commercial puzzle game, it is possible to better capture these aspects and produce a more accurate estimation of difficulty.

Inspired by these approaches to agent-based testing and parametric difficulty modelling, in this study, we propose a combined method based on the RL approach by Kristensen et al. [15, 37]. The method and its components are chosen and evaluated through a comparative study intended to showcase how different combinations of methods and data perform at the difficulty estimation tasks described by the two research questions defined in the previous section. The aim of the study is to conduct a systematic analysis of the difficulty modelling problem in the context of puzzle games and establish a benchmark for future works in the field.

## 3. Case Study: Lily's Garden

In this article, we employ data from the free-to-play mobile puzzle game Lily's Garden by Tactile Games as a case study to model difficulty in a realistic commercial scenario. The game was released in early 2019 and has close to a million active daily users worldwide as of today. It is one of the top 10-grossing puzzle games in the US [44] and serves as a representative sample of games in this genre both in terms of gameplay and general characteristics.

Lily's Garden is a puzzle game with an overarching narrative in which the player can unlock decorative pieces and story plots by completing puzzle levels. These puzzle levels are blast-type puzzles and contain a game board that can be up to 13 by 9 in size. An example of a level is shown in Figure 1. The core gameplay consists of tapping on basic board piece clusters of the same colour to remove the pieces themselves as well as adjacent nonbasic pieces. By tapping on larger clusters, more powerful pieces can be created, which can clear larger areas on the board. To complete the level, the player must clear a number of objectives within a given move limit. As a part of the free-to-play business model the game employs, it is also possible for the player to use booster items that can affect the game board directly or add additional moves, which can be acquired from in-game events and purchases. However, all levels are designed to be completed without the necessity of using any boosters.

![Screenshot of a Lily's Garden blast-puzzle level (level 103): a grid of coloured flower/block tiles at the top, rows of cookie-like pieces, grey stones and green bushes below; left panel shows 38 moves left and the goals (collect 18 of one item, 20 of another); booster buttons on the right.](fig-1.png)

*Figure 1: Example puzzle level in Lily's Garden.*

There are currently more than 6000 available levels, but in this study, we chose to limit the modelling and predicting difficulty to the first 500 levels as they are a representative sample of the entire level database. Using the definition of difficulty as the average number of attempts per complete, the difficulty over the level range can be seen in Figure 2. The first 100 levels or so contain multiple tutorials and easy levels to properly onboard new players and engage them in the background story. Subsequently, the difficulty stabilises at around 3.2 attempts per completion, with easier levels typically being completed in just one attempt and more difficult levels requiring upwards of an average of 7 attempts.

![Line plot of average attempts per completion (y, 1 to 7) against level number (x, 0 to 500): a light per-level line fluctuating between about 1 and 6.5, a darker 12-level rolling mean rising from about 1.2 at level 0 to about 3.2-3.5 after level ~140 and staying around 3-4; grey vertical bars mark tutorial levels, dense before level ~20 and sparse afterwards. A side histogram of per-level averages peaks at about 2.5-3 attempts (roughly 60-65 levels per bin).](fig-2.png)

*Figure 2: The average attempts per complete over the first 500 levels investigated. A rolling mean with a window size equal to 12 is also shown to visualise the trend. The vertical grey bars indicate tutorial levels. Adapted from Kristensen et al. [5].*

While the average varies around 3 attempts, there are large individual differences. As an example of this, Figure 3 shows the distribution of attempts on an easy and hard level and their averages. Players most commonly only spend one attempt on a level, but due to both the random elements of the game and player skill, hard levels sometimes require upwards of 30 attempts or more. This long-tailed distribution appears similar (but not equal) to a geometric distribution where the mean (i.e., the average number of attempts) is proportional to the inverse pass rate and the variance is proportional to the mean and pass rate.

> Editor's note: the published article has no figure showing this attempts distribution; its Figure 3 (below, in Section 4) is the RMSE bar chart. The figure references in Sections 3, 6 and 6.2 appear to be numbering errors in the original.

## 4. Methods

In a similar approach to Kristensen et al. [5], we treat the task of predicting the number of attempts a player will spend on a level as a supervised regression task. We employ a two-step approach similar to that used by Gudmundsson et al. [16], where we first extract relevant data from a playtest agent and then train a prediction model. We build on these previous works by testing multiple models and multiple combinations of analytics and simulated data in different prediction scenarios. In the following section, we describe the playtest agent used to collect the simulated data and the different types of regression methods that will be used in the experiments. The specifics and hyperparameters of each setup are described in Appendix A.

### 4.1. Playtest Agent

To explore the dynamics of each puzzle in the game, we employ a reinforcement learning agent, where we follow the learnings from previous work on creating a playtesting agent for Lily's Garden [15, 37]. To capture the game numerically, each level is described by a 3D array of size $13 \times 9 \times n$, where $n = 27$, and represents various board-piece mechanics. These mechanics include possible colours, whether the piece is clickable or not, and if it is a goal piece. If a board piece is present in a given position, its hit points are added to the position in each of the channels that match the mechanics of the piece. In addition to the game board, we also provide information about the number of moves taken, the moves left, and how many total goal pieces remain after the match. Possible actions correspond to a position on the game board, which means that there are $13 \times 9 = 117$ possible actions, with invalid moves masked out. A more comprehensive description is given on the website (https://aicompetition.tactilegames.com/environment).

Differently from our previous works aiming to create a single playtesting agent that learns to generalise its strategies to any level, we train one agent for each level to be used as data samples representing user behaviour. For each level, we collected the data for 8 random seeds, which allows us to test different level configurations and learn multiple optimal strategies for each level.

We let the agent take up to 100 moves per episode, which is around double the average normal move limit of 42. In order to encourage the agent to learn to finish the level as quickly as possible, we reward the agent for completing the level and give an additional bonus for completing it before the normal move limit, or a penalty if it spends more than the move limit. Additionally, we also introduce a small reward for creating power-piece combinations, which can be key to winning some levels. The final reward function is as follows:

1. $+0.1$ for each goal collected
2. $+0.8$ if completing the level
3. $\max(-0.8;\ +0.05 \cdot [M - n])$ on level completion, where $n$ is the number of steps taken and $M$ is the move limit
4. $+0.1$ for each power piece combination used

### 4.2. Prediction Methods

We test out three different methods for this problem: a neural network (NN) and a random forest (RF) approach, which generally work well with dense data, and a factorisation machine (FM) method, which extracts a latent representation of interactions that enables modelling sparse, high-dimensionality data such as user-item interactions.

#### 4.2.1. Random Forest

Random forest (RF) is an ensemble prediction method that utilises multiple decision trees created using a random subset of the features and data. This enables nonlinear modelling and predictions, and it has been used for the same task in previous work [5].

RFs generally do not work very well with high-cardinality data such as unique user identifiers and levels since splits on individuals are not generalisable and can easily lead to overfitting. A way to improve the model's ability to generalise to new data is by limiting the maximum depth and number of trees and using a smaller subset of features for building the trees.

#### 4.2.2. Artificial Neural Networks

Artificial neural networks are another way to model nonlinear processes. Although they are a more black-box approach than RF, their performance is usually comparable to or better than RF methods, and they can be trained incrementally while keeping the model size constant. This is unlike RF methods which either need to be fully retrained or incrementally retrained by adding new individual trees to the ensemble.

Artificial neural networks can be prone to overfitting due to the large number of parameters in the models. To improve their ability to generalise, regularisation and/or dropout layers are commonly employed strategies [45].

![Grouped bar chart titled "Personalised predictions on historic levels": RMSE_PD (y, 0 to 4.x) for models FM, NN and RF, with four bars each (Only historic, Player data and level features, Agent, All) and a dashed baseline (levels 100-400 mean) at about 4.1. FM bars all about 3.70; NN about 3.72 / 3.83 / 3.92 / 3.78; RF about 4.28 / 4.38 / 4.47 / 4.37 (all RF bars above the baseline).](fig-3.png)

*Figure 3: RMSE of personalised predictions on content that has been played by other players.*

Approximate values read from the plot (RMSE<sub>PD</sub>, baseline ≈ 4.1):

| Model | Only historic | Player data + level features | Agent | All |
|---|---|---|---|---|
| FM | ≈3.70 | ≈3.70 | ≈3.70 | ≈3.70 |
| NN | ≈3.72 | ≈3.83 | ≈3.92 | ≈3.78 |
| RF | ≈4.28 | ≈4.38 | ≈4.47 | ≈4.37 |

(The legend title in the original reads "Included date", a typo for "Included data".)

#### 4.2.3. Factorisation Machines

Factorisation machines (FMs) are a general-purpose method that can be used for both classification and regression tasks and belong to a family of matrix factorisation methods in which entities are described by an embedded latent vector that allows modelling of a sparse interaction between entities [46]. Specific to FMs, features can consist of high-cardinality data, such as user and level identifiers, and dense data, such as content tags or level descriptors. The formula is given by

$$\hat{y} = w_0 + \sum_{i=1}^{n} w_i x_i + \sum_{i=1}^{n} \sum_{j=i+1}^{n} \langle \mathbf{v}_i, \mathbf{v}_j \rangle x_i x_j, \tag{1}$$

where $w_0$ is a global bias, $w_i$ is the bias of the $i$th variable, $\mathbf{v}_i = [v_1, \cdots, v_k]$ is the latent representation of the $i$th variable using $k$ latent factors, and $\langle \mathbf{v}_i, \mathbf{v}_j \rangle$ is the dot product between the $i$th and $j$th that captures the second-order interactions of the variables.

Matrix factorisation methods, such as FMs, are particularly prone to *cold-start* problems; to learn a latent representation of a given item, it needs to be present in the training data, but that is not possible with unreleased content (e.g., new levels in puzzle games). One possible way to deal with this in FMs is by including additional data, such as tags or other item features, from which it is possible to learn latent representations.

## 5. Data

The exact type of data available will depend on the game. However, we can define four categories that the data can belong to, following the approach by Wheat et al. [28]:

1. *Historical data* that consider the average number of attempts by previous players, per-level or per-player basis
2. *Player data* that capture aspects related to player skill and purchasing tendency
3. *Level data* that capture specific types of game mechanics and descriptors of the level
4. *Agent data* that captures more dynamic information about the level and is extracted using a playtesting method

Each of these categories will have an impact on the performance of the prediction model, but they may not be fully informative on their own. For example, player data is necessary to include for personalised predictions, but on its own, it does not say anything about the level itself or how easily the player can handle specific gameplay elements. Similarly, agent data may reveal some intrinsic difficulty/ground truth pass rate, but without level data, it is hard to account for biases in the agent algorithm (i.e., certain mechanics may be easier to learn for an agent compared to a human [16]), and personalised predictions are impossible without player data. Lastly, historical data may be informative, but they are not available for new content or for new players. We, therefore, experiment with combining the data in a number of ways to test the importance of each data category. We consider the following combinations:

1. *Historic.* Only player-level attempt information. For FMs, this is implicitly learnt in the variable biases, while for the RF and NN approaches, it needs to be calculated explicitly. Only available for predictions on existing content
2. *Player data and level features.* Both player and level data are available for personalised predictions
3. *Agent.* Only agent data is used for nonpersonalised predictions
4. *All.* Player, level, and agent data combined are possible to use for nonpersonalised or personalised predictions. It does not include features that are explicitly derived from historical observations

### 5.1. Lily's Garden Case Study Data

The data used in this study consists of the number of attempts each player has spent on a given level and is recorded between 2021-06-01 and 2021-12-01. Only players who have started playing the game in this interval and played at least 200 levels are included in the dataset. We use data that come from the four different categories of data mentioned previously. An overview of these features is shown in Table 1.

The player data consists of aggregate player data over the first 100 levels. We consider the average number of moves they have used to complete the levels, as well as booster usage on the first 100 levels. These features capture the general competence of the players and their willingness to pay to progress, which are both strong predictors of how many attempts they will use on future levels [5].

The level attributes describe the size of the board and the goals and board pieces present in the level. Additionally, the number of colours and the entropy of the colour distribution are also included, which can affect how easy it is to make stronger combinations and thus the difficulty of the level. Unlike previous work where some of the level features consisted of historical data such as the average number of attempts on the level, for this study, we only include features that are possible to determine before any players played the given level. This is necessary since, in the experiments, we consider the scenario with new levels where no historical data is available.

Lastly, for the agent data, we include information about how well the agent learnt to play the level and how easily it learnt to do so. We do this by recording some features at the point during training at which the average number of moves taken by the agent is the lowest, as well as the standard deviation of the features between the time steps 1 M and 9 M.

*Table 1: Features investigated for the different models. The player features are aggregated means on the first 100 levels. The values of the agent features are averaged from the last 100 episodes/playthroughs. For some of the agent features, we include both the value at the time step where the smallest average number of steps was achieved (denoted* min*) and the standard deviation of the feature between time steps 1 M and 9 M (denoted* std*).*

| Type of feature | Name | Description |
|---|---|---|
| Historical data | Average attempts (level) | Average attempts on the level based on playthroughs by old players |
| | Average attempts (player) | Average attempts by the player on the first 100 levels |
| Player features | Moves used | Number of moves used relative to the move limit when completing the level |
| | In-game boosters | Boosters that can be used during the level |
| | Pregame boosters | Boosters that can be used before starting the level |
| Level attributes | Board size | Number of available board slots |
| | Colour entropy | Entropy of colour spawning weights; $S = -\sum_i p_i \log p_i$ |
| | Colours | Number of unique colours in the level |
| | Board pieces | Multiple features that each describe the number of board pieces on the initial board |
| | Collect goals | Multiple features that each describe the number of collect goals |
| Agent features | Training steps | Number of training steps until minimum average length was achieved |
| | Move limit | Move limit of the specific level |
| | Game length (min + std) | Average number of moves used to complete level across 8 seeds |
| | Completion rate (min + std) | Fraction of times the agent finished the level within the move limit/100 moves across all 8 seeds |
| | Action entropy (min + std) | RL agent action entropy |
| | Training losses (min + std) | RL policy and value losses |

## 6. Experiment A: Personalised Predictions

The first research question (RQ1) is aimed at investigating the modelling of the perceived difficulty of a puzzle level for a specific player. We follow a similar approach as Kristensen et al. [5] where we use data from the commercial puzzle game, Lily's Garden, which is described in Section 3. However, we extend the study by also considering a cold-start scenario where there are no observations available for a given level. We denote the two cases as *playthrough/historical data* (PD) and *cold-start* (CS).

To create datasets for training and testing, we split the data in two different ways, which are shown in Figure 4. In the first case, we split the players into train/test sets with a 99-1 split but included observations of the players from the test set in the training setup until the first $n_\text{obs}$ levels. In the second case, we split by level number, where the first 400 levels are used for training and the last 99 levels are used for testing.

![Two schematic players-by-levels rectangles. Top (historical data case): 99% of players are training data over all levels; the 1% test players contribute training data up to level n_obs, are greyed out (ignored) between n_obs and 400, and are test data after level 400. Bottom (cold-start case): all players' levels before 400 are training data; levels after 400 are test data for the 1% test players and greyed out for the other 99%.](fig-4.png)

*Figure 4: Train/test split of the data for personalised predictions on levels with historical data and on levels in the cold-start scenario. In this study, we adopt $n_\text{obs} = 100$. The greyed-out area is ignored observations to ensure the experiments are evaluated on the same content. Adapted from [5].*

The nature of the prediction task, in which very difficult levels can have a large variance in attempts, as shown previously in Figure 3, means that the best-performing models in terms of root mean squared error (RMSE) and mean absolute error (MAE) may be different. Since the models are optimised using RMSE and we want the method to be more robust towards more difficult levels, we chose to use RMSE as the reported metric. We calculate it from the same group of players above level 400 in all cases.

We test out the three methods described in Section 4.2, and we train them using the four different combinations of data outlined in Section 5. In the first case, we include a naive baseline prediction for each level, which is calculated as the average number of attempts on the given level by the players in the training set. In the second case, we use a constant prediction of $y_\text{baseline} = 3.23$ that is calculated as the average number of attempts on levels 100-400.

### 6.1. Personalised Predictions with Historical Data Available

The performance of the methods in terms of RMSE in the first case is shown in Figure 3. The best-performing model is the FM model which only includes player and level data. FMs appear to be more robust in identifying possible bottlenecks for an individual player, where they possibly require a large number of attempts and may feel stuck. This can be used to the game designers' advantage by preemptively assisting the players if, for example, the estimated perceived difficulty exceeds a certain threshold.

Another observation to note is that, while the NN and FM approaches perform better than the baseline, the RF model appears to perform worse than all other methods. A crucial difference between this study and the study by Kristensen et al. [5] is that the level features do not include the historical average attempts because this information would not be available when estimating the difficulty of unreleased levels. Without such a strong predictor, the RF model does not appear to be able to infer a meaningful average prediction. Furthermore, both the FM and NN approaches do not employ average attempts as input, but they may be able to infer the average attempts on each level through either the complexity of the network or the variable biases, $w_i$, of the FM model.

The impact of using different types of data as input to the FM method is shown in Figure 5. The results are in line with previous studies [2] in which the RMSE and MAE are around 3.8 and 2.3, respectively, and augmenting the data with player and level data leads to a minor improvement. An extension to the previous study also includes simulated agent data; these data do not significantly improve the predictions for the FM method, and the addition leads to worse performance in combination with the player and level data categories. A closer inspection of the training process shows that the performance on the test set worsens after just 50 iterations when including all data categories, while in other cases, a performance drop happens after around 950 iterations. This suggests that a likely cause for the poorer performance is the tendency of the model to overfit. Furthermore, in a high-dimensional space with strongly correlated parameters, the Gibbs sampler used in the MCMC optimiser for the FM method may not converge [47], which is the case with the colour entropy and colours of the level attributes and the minimum and standard deviation of the duration of the games.

In terms of other model parameters, four factors seem to work best for optimising RMSE, but at the cost of increasing the MAE. However, the difference in performance when using between two and four factors is not significant and does not contradict the results of previous work in which two factors were concluded to be sufficient. Using additional data does not warrant the use of more than four factors and, in fact, can worsen the performance. There is no clear pattern of whether using a global bias improves the predictions, although the best-performing model does include a global bias.

![Line plot titled "FM models": RMSE (y, 3.700 to 3.720) against number of latent factors (x: 1, 2, 4, 8), one line per additional-data set (Only historic, Player data and level features, Agent, All), solid without and dashed with global bias. All lines start above 3.720 at 1 factor, drop to about 3.703-3.712 at 2 factors, reach their minimum at 4 factors (about 3.702-3.706) and rise slightly at 8 factors (about 3.705-3.712). The lowest point is Player data and level features with global bias at 4 factors (≈3.702).](fig-5.png)

*Figure 5: RMSE of the tested FM models for personalised predictions on current levels as a function of a number of factors. The colours indicate what additional data are included in the dataset. The dashed line indicates whether $w_0$ is included in the model or not (see Eq. (1)).*

### 6.2. Predictions in Cold-Start Scenarios

In the second case, the performance of the models is very similar, as seen in Figure 3. Excluding the models with only historical data, since this is not available in the cold-start scenario, all three FM models perform better than the comparable NN and RF models. Similarly, only the RF models perform worse than the constant baseline. The same parameters for the FM methods (4 factors, both global and variable bias included) lead to the best performance of the tested FM configurations.

Since the personalised predictions in both cases have very similar RMSE, we look at the difference between the errors in the two cases in Figure 6 to better compare the performances. The results show that for all the methods, the error in the cold-start scenario is higher regardless of data type. This is not surprising since the information from other players' performances on a level should be a strong predictor of the perceived difficulty of other players. In the FM approach, including agent data does lead to a smaller gap in error in the two scenarios, which suggests that agent data does contain important predictors for predicting difficulty that the FM model learns to utilise. This is also true for the other methods, but the difference between the two scenarios for the NN and RF models is still higher than in the FM case.

![Grouped bar chart: RMSE_CS − RMSE_PD (y, 0 to about 0.18) for FM, NN and RF by included data. FM: Only historic ≈0.115, Player+level ≈0.118, Agent ≈0.049, All ≈0.107. NN: Player+level ≈0.181, Agent ≈0.143, All ≈0.129. RF: Player+level ≈0.184, Agent ≈0.082, All ≈0.113. No Only-historic bars for NN and RF.](fig-6.png)

*Figure 6: Difference in RMSE for personalised predictions between the scenario where data about player playthroughs (PD) is available and the cold-start (CS) scenario. A positive difference indicates that the error in the cold-start scenario is higher.*

Approximate values read from the plot ($\text{RMSE}_\text{CS} - \text{RMSE}_\text{PD}$):

| Model | Only historic | Player data + level features | Agent | All |
|---|---|---|---|---|
| FM | ≈0.115 | ≈0.118 | ≈0.049 | ≈0.107 |
| NN | – | ≈0.181 | ≈0.143 | ≈0.129 |
| RF | – | ≈0.184 | ≈0.082 | ≈0.113 |

It is notable that the performance of the models is similar and that the FM method with no included data performs better than a constant baseline. Since the FMs reduce to a simple linear function that consists of a global bias and a bias term for the players according to Eq. (1) in cold-start scenarios, it suggests that the learnt biases for individual players are sufficient to capture the general performance of the players on both existing and new content. This is valuable information for game designers, as it may be possible for them to use these learnt biases for more individualised content.

## 7. Experiment B: Cohort Predictions

The second research question is regarding the possibility of making cohort predictions. Level designers are typically interested in knowing the average number of attempts on the levels, and since different cohorts reach the levels at different times, the measured average difficulty may change over time, depending on the cohort. This experiment simulates this by comparing the aggregated average predictions per level with the average attempts on each level for the cohort in the test set. Similar to the previous experiment, we consider both the scenario where there is historical data from previous players' playthroughs on a given level and a cold-start scenario. We use the same baselines as in the previous experiment.

We consider two ways of predicting the average number of attempts on a cohort level. The first approach uses the personalised predictions from the first experiment and computes the aggregated average on each level. For the second approach, since individual estimates may be noisy or inaccurate, we group the players into 10 random cohorts and use the aggregated average values of the player features to describe these cohorts. The regression target for each cohort is then their average number of attempts at the given level. This allows us to directly use the tested methods to predict the average number of attempts per level of the players' cohort in the test set. These two approaches will be denoted by how the initial predictions are grouped (i.e., personalised or cohort), but we note that in both cases, the final estimates are on a cohort level.

A summary of the results achieved by the investigated methods is shown in Figure 7. The errors for all models when predicting the difficulty of existing content are very low, which is not surprising since the cohorts are generally not very different, as demonstrated by the very small RMSE of the baseline. The personalised errors are generally larger than the cohort-based predictions, which is most likely due to the fact that these models are optimised to minimise the RMSE for each player. The optimal model, in this case, is not necessarily one that captures the average number of attempts by the whole cohort but rather one that can account for the high within-level variance. This is clear for the FM models, in which using only one factor leads to an error similar to the baseline, but more factors lead to a higher RMSE in this experiment, where we show the results from the 4-factor models.

![Four-panel grouped bar chart of RMSE with error bars. Columns: "Cohort based" (models NN, RF) and "Personalised aggregated" (FM, NN, RF); rows: "Historic" (y 0 to 0.6, dashed baseline at 0.05) and "Cold start" (y 0 to 1.5, dashed baseline at 1.195). Historic row: cohort-based bars are all near 0.05-0.11; personalised aggregated FM bars ≈0.12, NN ≈0.15 / 0.63 / 0.23 / 0.14, RF ≈0.12 / 0.37 / 0.12 / 0.33 (Only historic / Player+level / Agent / All). Cold-start row (no Only-historic bars): cohort NN ≈1.13 / 0.97 / 0.91, cohort RF ≈1.19 / 0.96 / 0.94; personalised FM ≈1.18 / 1.01 / 1.16, NN ≈1.23 / 1.09 / 0.92, RF ≈1.23 / 0.99 / 0.95 (Player+level / Agent / All).](fig-7.png)

*Figure 7: RMSE of the different approaches for predicting the average difficulty of a level for a cohort. The left plots show the cohort-based per-level predictions, and the right plots show the aggregated average of the personalised predictions for the full dataset. The top row is in the case where observations on the examined levels exist, while the bottom row is the cold-start scenario. Note that historical data is not available in the cold-start scenario.*

Approximate cold-start values read from the plot (cohort-level RMSE, constant baseline = 1.195):

| Approach / model | Player data + level features | Agent | All |
|---|---|---|---|
| Cohort-based NN | ≈1.13 | ≈0.97 | ≈0.91 |
| Cohort-based RF | ≈1.19 | ≈0.96 | ≈0.94 |
| Personalised aggregated FM | ≈1.18 | ≈1.01 | ≈1.16 |
| Personalised aggregated NN | ≈1.23 | ≈1.09 | ≈0.92 |
| Personalised aggregated RF | ≈1.23 | ≈0.99 | ≈0.95 |

In the cold-start scenario, both the NN and RF models are the best-performing models and appear to have similar performance for both personalised and cohort predictions. Additionally, including all possible categories achieves the best results for the NN and RF methods, similar to what was found in the first experiment. This is not the case for FM with all data included, though, which seems to suffer from the same type of overfitting seen previously. The model parameters for the best-performing FM models were similar as well, where including both a global and variable bias as well as using 2-4 latent factors led to the best performance.

Generally, including only player and level data is insufficient for the model to perform better than the baseline. Only with the inclusion of agent data, the model can produce predictions more accurately than a simple constant average. By looking at the feature importance for the RF models, we also find that the agent features are on average 5-6 times more impactful than the level features, with the minimum game length and completion rate being among the most important. These results highlight the importance of having a playtest agent that can capture dynamic aspects of a level to allow more accurate predictions in cold-start scenarios. It also supports the conclusion by Gudmundsson et al. [16] that combining agent performance with level features is useful to account for differences in how players and AI agents learn and behave.

Another notable result is that cohort predictions are on par with personalised predictions for estimating the average level's difficulty in the cold-start scenario. To visualise the differences between the two approaches, Figure 8 shows the predictions from each method compared to the actual average number of attempts. Both methods tend to overestimate the difficulty of easy levels, underestimate the difficulty of hard levels, and tend to predict the mean number of attempts. This suggests that they are both underfitted or that the features are not informative enough to generalise to new levels. The personalised predictions tend to have a larger variance, especially at higher difficulties, as can be seen from the 80% prediction interval. This is not completely unexpected due to the high variance in attempts between players on harder levels, as shown in Figure 3.

![Scatter plot of predicted vs. actual average attempts per level (x 1 to 6.3, y 1 to 7) for the ~99 cold-start test levels: blue dots (cohort NN) and orange dots (personalised NN) with fitted regression lines and confidence bands, a dashed identity line, and a grey 10%-90% band of the personalised predictions (rolling mean of 5). Both fitted lines are much flatter than the identity: predictions run from about 2-2.5 at actual ≈1.3 to about 4.6-4.9 at actual ≈6.3, i.e. easy levels are overpredicted and hard levels underpredicted.](fig-8.png)

*Figure 8: Example of predictions of the NN method with cohort and personalised predictions using all categories of data in the cold-start scenario.*

## 8. Discussion

From the results of the experiments, it is clear that the tasks of creating personalised difficulty predictions for players on content with and without available player playthrough data require different approaches. While a part of this is related to generalisability and overfitting, a deeper discussion about the data and models can help understand in which circumstances one approach works better than another. In this section, we therefore focus on three topics: the difference between models for old and new content, the feasibility of using any of these models in practice, and playtest agent data.

### 8.1. Choice of Model

One complication with a combined difficulty framework that can work on both old and new content is that the available data for the two scenarios are inherently different. For new content, there are no direct observations of how many attempts the actual players make on a level. This cold-start problem can especially be an issue for factorisation-based approaches, such as FMs, since the bias and latent factors associated with new content cannot be properly inferred with no observations. Although the inclusion of additional data in FM methods, such as tags [48] or player/level/agent data, can alleviate this problem, we still observe that the predictions tend to stay close to the global average and do not capture the full range of player behaviours on new levels.

For the RF and NN approaches, the cold-start problem does not exist to the same extent. FMs learn latent descriptions for each item, but the RF and NN methods instead only use the included data features. This makes these latter models not rely on modelling specific items, at the cost of not having as accurate personalised predictions, as seen in the first experiment. It is therefore also not surprising that the difference between personalised and cohort predictions on new content is insignificant with those two methods: the features with high predictive power (mainly agent data) are the same, so the information that is possible to extract is the same. It is interesting to observe how the additional simulated statistics produced by the agent impact the difference between the modelling methods, which is substantially different from the results reported by Wheat et al. [28]. The data for personalised model training are essentially an oversampled dataset of the full dataset.

It is worth noting that, for the RF method, while the results of the second experiment for both personalised and cohort predictions were promising, the results from the first experiment showed that the RF method performs worse than the baseline to predict individual perceived difficulty. The inability of the RF method to capture individual differences may be due to the greedy nature of the algorithm and the fact that the given player's features were too uninformative compared to both agent and level data.

Ultimately, both regarding training and the ability to capture complex behaviours, a neural network-based approach is more feasible for personalised predictions on both old and new content, though at the cost of interpretability. For accurate and interpretable methods on existing content, the FM-based approach appears more suitable. Compared to previous works on difficulty prediction, these results demonstrate the advantage of a more complex nonlinear model compared to random forests [28] or binomial regression [16].

### 8.2. Difficulty Modelling in Practice

An important question about this approach is whether these results reflect how these methods would work in practice. To answer that, we consider some aspects regarding how we collect and split the data.

The data used in this study was collected over a six-month period, but there is no information about when the players started or stopped playing or which cohort they might belong to. To enable the level designers of a live game to be proactive, a more realistic approach would be to consider whether the player has been active recently or not. Although the approach used in this study made it possible to compare it with previous work [5], an idea for a future study is to use a rolling window where the training data only include data before a given date and the test data only include data after this date up to the prediction date where the level designers would use the results.

Another consideration regarding the way the data is split is whether the scenario of having historical data or the cold-start scenario is necessary. While the cold-start scenario is representative of completely new content, there are often other concerns when creating new levels, such as whether the puzzle feels fun or if the solution(s) are clear. This is a much harder problem to solve and requires the level designers to play through the levels regardless. This also means that, in practice, there is a smooth transition from a complete cold-start scenario to a scenario with some historical data available—and not just by the level designers but also by other players due to prereleases to certain regions or A/B tests. Since FMs should work well with such sparse data, an interesting line of research would therefore be to investigate how many observations of attempts on a level are necessary to beat the baseline. This question of how many observations are necessary has been explored by Kristensen et al. [5] for players, but it would be valuable to learn whether the results are true for levels too.

We also note that, to address this cold-start scenario, we experimented with treating the agent as a player. It is a way that could help alleviate the cold-start problem in FMs where enriching item data by adding new ratings (e.g., [49]) can augment very sparse observations. However, initial experiments did not show promising results, and an even stronger tendency to predict the global average was observed.

With the ultimate goal of being able to employ this difficulty framework in a live game, the main concern is whether the accuracy, especially for new content, is accurate enough for the level designers to rely on. Gudmundsson et al. [16] consider the same business problem and present a method based on a similar two-step approach that employs a playtest agent to extract an agent pass rate and subsequently use it in a prediction model. They mentioned that King used it for two of their games and reported that the best model has a 4.0% to 6.6% MAE on the pass rate. Translating our results from attempts to pass rate, our method has an 8.1% MAE. However, it is not possible to translate the result directly since they do not report the absolute magnitude of the win rates, which means if they have more hard levels with low, but similar, pass rates, the reported MAE is also expected to be lower. Additionally, they considered two different games which share many similar mechanics but still observed a difference in the predicted performance.

While it is hard to make a direct comparison, the results in this study can still inform level designers about the scale of difficulty, and further ideas could involve classifying the levels into easy, medium, and hard difficulties rather than directly predicting the number of attempts. Furthermore, the variation of the results within the experiment by Gudmundsson et al. [16] and between that and this experiment, although minor, can be further studied to investigate whether there are specific differences in the player base, the characteristics of the games, or the methods employed that lead to the observed results.

One final challenge encountered during experimentation relates to the deployment and maintenance of such models in production. Maintaining and retraining machine learning models to adapt to new content and a dynamic user population presents several challenges: the nonstationary environment in which these models operate means that the data distribution can change over time, a phenomenon known as concept drift, and the scalability of retraining processes is a concern as the computational resources needed can be substantial, especially with large datasets and complex environments. However, for the scenario presented in the article, we have observed that the population drift can be accounted for by daily retraining of the FM model—the training took only 14 hours on an Intel Cascade Lake c2-standard-16 Google Cloud machine. New content production requires the training of a new agent for each level; while this is not a challenge in computational terms, the amount of agents to be stored and updated grows linearly over time with the amount of content generated.

### 8.3. Beyond Mobile Puzzle Games

While our study focuses on a particular puzzle game, we anticipate that our factor model, which is suitable for any game where outcomes can be derived from the interaction of user skills and content difficulty and where multiple users engage with the same content, could be applicable to a wide range of games, including various puzzle genres and other game types. However, games with high randomness or unique content for each player may not fit this model, and transferring a model to a different game is only viable if the games share similar gameplay and variable distributions. Future research could potentially integrate data from multiple games played by the same users into a comprehensive factor model dataset.

Furthermore, the suggested solution to the cold-start scenario implied the training of game-playing agents capable of competently playing the game under consideration. Using reinforcement learning (RL) to train agents for game playing involves several challenges related to the complexity of game environments, which can include elements like high uncertainty, hidden information, and large state and action spaces [50], making the proposed method not yet applicable to some of the most complex games [51].

## 9. Conclusion

In this study, we considered two questions: is it possible to estimate the perceived difficulty of a puzzle level for a given player on both existing and newly generated (human or otherwise) levels and is it possible to do this on a cohort level? To answer these questions, we tested three different prediction methods to estimate the number of attempts each player is expected to use to complete a given level using data from a live commercial puzzle game. Additionally, we experimented with including and combining data belonging to four categories: historical data, player data, level data, and agent data collected by a reinforcement learning playtesting agent.

For personalised predictions on existing content, with previous players' data, the factorisation machine approach performed significantly better than the random forest and neural network methods. However, including all three types of data for the factorisation machine led to poorer performance, most likely due to overfitting and bad optimisation conditions. The neural network approach worked better than the baseline, while the random forest performed worse. This is explained by the fact that the NN method can capture the historical average number of attempts through the complexity of its network and sequential training that enables better handling of large datasets. To estimate the average difficulty of new content, in a cold-start scenario, the neural network approach worked the best for both personalised and cohort-based predictions, while the factorisation machine method did not work very well due to the cold-start problem common in factorisation methods.

It was also found that including the data collected by a playtest agent is necessary for the methods to perform better than the global average. However, since the agent performed consistently better than most players, it did not differentiate easily between easy and medium difficulty levels. A potential improvement on this front would be the inclusion of persona-based agents that mimic different kinds of solving strategies [52].

Overall, the results show the ability of the neural network-based model to capture more complex interactions compared to other methods previously investigated [16, 18] and the positive impact of simulated agent data to mitigate the cold-start scenario compared to pure historical data-based methods [5].

## Appendix A. Method Parameters

### A.1. Playtest Agent Setup

We use an implementation of PPO from Stable Baselines3 [54]. We use a three-layer convolutional neural network (ConvNN) with 32 filters each, a stride of 1, kernel sizes of [2, 3], and paddings of sizes [1, 0, 0]. Additionally, to make the method time- and progress-aware, we concatenate the flattened output from the ConvNN of size 64 with a vector with information about the progress and limit for both episode length and goals, as suggested in [55]. The critic network head has two fully connected layers of size 128, and the actor-network head has two fully connected layers of size 32. All activation functions are exponential linear units (ELUs).

We use the following hyperparameters:

1. ent_coef: 0.01
2. learning_rate: $3e-4$
3. batch_size: 512
4. n_steps: 256
5. n_epochs: 4
6. clip_range_vf: 1.0
7. gamma: 0.99
8. gae_lambda: 0.95

### A.2. Random Forest Setup

We use the random forest regressor implementation from the scikit-learn library version 1.0.2 [56]. Due to the size of the data, we also incrementally train the model using incremental trees (https://github.com/garethjns/IncrementalTrees). We use the following hyperparameters for the RF (*nonpersonalised/personalised*) setup (default parameters unless otherwise noted):

1. n_estimators: 150/260
2. max_depth: 8/8
3. max_features: 3/3

### A.3. Neural Network Setup

We use a simple, fully connected feed-forward neural network with three layers and 256 and 64 neurons for personalised and nonpersonalised predictions, respectively. To improve generalisation, we also employ 0.1 dropout layers and an L2 regularisation of strength $1e-5$ during training.

### A.4. Factorisation Machine Setup

We use the implementation of LibFM version 1.4.2 with the MCMC inference method for model parameters. We use an initial standard deviation for initialising $\mathbf{v}$ of 0.1. We also use the meta option to assign players and levels into separate groups, which allows for a more complex regularisation of parameters by assigning different regularisation parameters for each group.

## Data Availability

The data used in the method development is not publicly available.

## Disclosure

The work described in this article is part of Dr. Kristensen's doctoral thesis, and an earlier version of this manuscript can be found in Dr. Kristensen's dissertation [53].

## Conflicts of Interest

The authors declare that they have no conflicts of interest.

## Acknowledgments

The work has been funded by the Innovation Fund Denmark agency under the Industrial Researcher program. The Innovation Fund is a Danish public agency that promotes technological transfer from university to industry. After the project is accepted, the agency does not influence the research activities other than by monitoring and ensuring their quality.

## References

1. M. Csikszentmihalyi and M. Csikzentmihaly, *Flow: The Psychology of Optimal Experience*, Harper & Row, New York, 1990.
2. "Gaming market - growth, trends, COVID-19 impact, and forecasts (2022-2027)," https://www.mordorintelligence.com/industry-reports/global-gaming-market.
3. "Global games market to generate $175.8 billion in 2021; despite a slight decline, the market is on track to surpass $200 billion in 2023," https://newzoo.com/insights/articles/global-games-market-to-generate-175-8-billion-in-2021-despite-a-slight-decline-the-market-is-on-track-tosurpass-200-billion-in-2023/.
4. "How much is the gaming industry worth in 2022? (revenue &stats)," https://earthweb.com/how-much-is-the-gaming-industry-worth/.
5. J. Kristensen, C. Guckelsberger, P. Burelli, and P. Hämäläinen, "Personalized game difficulty prediction using factorization machines," in *Proceedings of the 35th Annual ACM Symposium on User Interface Software and Technology*, Bend, OR, USA, 2022.
6. A. Denisova, P. Cairns, C. Guckelsberger, and D. Zendle, "Measuring perceived challenge in digital games: development & validation of the challenge originating from recent gameplay interaction scale (CORGIS)," *International Journal of Human-Computer Studies*, vol. 137, article 102383, 2020.
7. A. Denisova, C. Guckelsberger, and D. Zendle, "Challenge in digital games: towards developing a measurement tool," in *Proceedings of the 2017 CHI Conference Extended Abstracts on Human Factors in Computing Systems*, pp. 2511–2519, Denver, Colorado, USA, 2017.
8. J. Chen, "Flow in games (and everything else)," *Communications of the ACM*, vol. 50, no. 4, pp. 31–34, 2007.
9. R. M. Ryan, C. S. Rigby, and A. Przybylski, "The motivational pull of video games: a self-determination theory approach," *Motivation and Emotion*, vol. 30, no. 4, pp. 344–360, 2006.
10. A. Tyack and E. D. Mekler, "Self-determination theory in HCI games research: current uses and open questions," in *Proceedings of the 2020 CHI Conference on Human Factors in Computing Systems*, Honolulu, HI, USA, 2020.
11. J. T. Alexander, J. Sear, and A. Oikonomou, "An investigation of the effects of game difficulty on player enjoyment," *Entertainment Computing*, vol. 4, no. 1, pp. 53–62, 2013.
12. J. H. Brockmyer, C. M. Fox, K. A. Curtiss, E. McBroom, K. M. Burkhart, and J. N. Pidruzny, "The development of the game engagement questionnaire: a measure of engagement in video game-playing," *Journal of Experimental Social Psychology*, vol. 45, no. 4, pp. 624–634, 2009.
13. M. Pusey, K. W. Wong, and N. A. Rappa, "The puzzle challenge analysis tool. A tool for analysing the cognitive challenge level of puzzles in video games," *Proceedings of the ACM on Human-Computer Interaction*, vol. 5, 2021.
14. S. Roohi, C. Guckelsberger, A. Relas, H. Heiskanen, J. Takatalo, and P. Hämäläinen, "Predicting game difficulty and engagement using AI players," *Proceedings of the ACM on Human-Computer Interaction*, vol. 5, no. CHI PLAY, pp. 1–17, 2021.
15. J. T. Kristensen, A. Valdivia, and P. Burelli, "Estimating player completion rate in mobile puzzle games using reinforcement learning," in *2020 IEEE Conference on Games (CoG)*, pp. 636–639, Osaka, Japan, 2020.
16. S. F. Gudmundsson, P. Eisen, E. Poromaa et al., "Human-like playtesting with deep learning," in *2018 IEEE Conference on Computational Intelligence and Games (CIG)*, Maastricht, Netherlands, 2018.
17. R. Hunicke, "The case for dynamic difficulty adjustment in games," in *Proceedings of the 2005 ACM SIGCHI International Conference on Advances in Computer Entertainment Technology*, pp. 429–433, Valencia, Spain, 2005.
18. M. Zohaib, "Dynamic difficulty adjustment (dda) in computer games: a review," *Advances in Human-Computer Interaction*, vol. 2018, Article ID 5681652, 12 pages, 2018.
19. M. Gonzalez-Duque, R. B. Palm, and S. Risi, "Fast game content adaptation through Bayesian-based player modelling," in *2021 IEEE Conference on Games (CoG)*, Copenhagen, Denmark, 2021.
20. S. Xue, M. Wu, J. Kolen, N. Aghdaie, and K. A. Zaman, "Dynamic difficulty adjustment for maximized engagement in digital games," in *Proceedings of the 26th International Conference on World Wide Web Companion-WWW'17 Companion*, pp. 465–471, ACM Press, Perth, Australia, 2017, http://dl.acm.org/citation.cfm?doid=3041021.3054170.
21. D. B. Or, M. Kolomenkin, and G. Shabat, "Dl-dda-deep learning based dynamic difficulty adjustment with ux and gameplay constraints," in *2021 IEEE Conference on Games (CoG)*, Copenhagen, Denmark, 2021.
22. J. Pfau, J. D. Smeddinck, and R. Malaka, "Enemy within: long-term motivation effects of deep player behavior models for dynamic difficulty adjustment," in *Proceedings of the 2020 CHI Conference on Human Factors in Computing Systems*, Honolulu, HI, USA, 2020.
23. T. Constant and G. Levieux, "Dynamic difficulty adjustment impact on players' confidence," in *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, ACM, Glasgow Scotland UK, 2019.
24. J. Li, H. Lu, C. Wang et al., "A difficulty-aware framework for churn prediction and intervention in games," in *Proceedings of the 27th ACM SIGKDD Conference on Knowledge Discovery & Data Mining*, pp. 943–952, ACM, Virtual Event Singapore, 2021.
25. F. Mourato, F. Birra, and M. P. dos Santos, "Difficulty in action based challenges: success prediction, players' strategies and profiling," in *Proceedings of the 11th Conference on Advances in Computer Entertainment Technology*, Funchal, Portugal, 2014.
26. M. Van Kreveld, M. Löffler, and P. Mutser, "Automated puzzle difficulty estimation," in *2015 IEEE Conference on Computational Intelligence and Games (CIG)*, pp. 415–422, Tainan, Taiwan, 2015.
27. J. T. Kristensen, A. Valdivia, and P. Burelli, "Statistical modelling of level difficulty in puzzle games," in *2021 IEEE Conference on Games (CoG)*, Copenhagen, Denmark, 2021.
28. D. Wheat, M. Masek, C. P. Lam, and P. Hingston, "Modeling perceived difficulty in game levels," in *Proceedings of the Australasian Computer Science Week Multiconference*, Canberra, Australia, 2016.
29. A. E. Zook and M. O. Riedl, "A temporal data-driven player model for dynamic difficulty adjustment," *Eighth Artificial Intelligence and Interactive Digital Entertainment Conference*, vol. 8, no. 1, 2012.
30. S. Ariyurek, A. Betin-Can, and E. Surer, "Automated video game testing using synthetic and humanlike agents," *IEEE Transactions on Games*, vol. 13, no. 1, pp. 50–67, 2021.
31. A. Latos, *Automated playtesting on 2d video games. An agent-based approach on nethackclone via iv4xr framework*, [M.S. thesis], Utrecht University, 2022.
32. S. A. Dukkancı, *Level generation using genetic algorithms and difficulty testing using reinforcement learning in match-3 game*, [M.S. thesis], Middle East Technical University, 2021.
33. J. Bergdahl, C. Gordillo, K. Tollmar, and L. Gisslén, "Augmenting automated game testing with deep reinforcement learning," in *2020 IEEE Conference on Games (CoG)*, pp. 600–603, Osaka, Japan, 2020.
34. S. Stahlke, A. Nova, and P. Mirza-Babaei, "Artificial players in the design process: developing an automated testing tool for game level and world design," in *Proceedings of the Annual Symposium on Computer-Human Interaction in Play*, pp. 267–280, Virtual Event, Canada, 2020.
35. B. Horn, J. A. Miller, G. Smith, and S. Cooper, "A Monte Carlo approach to skill-based automated playtesting," *Fourteenth Artificial Intelligence and Interactive Digital Entertainment Conference*, vol. 14, no. 1, pp. 166–172, 2018.
36. J. Pfau, A. Liapis, G. Volkmar, G. N. Yannakakis, and R. Malaka, "Dungeons & replicants: automated game balancing via deep player behavior modeling," in *2020 IEEE Conference on Games (CoG)*, pp. 431–438, Osaka, Japan, 2020.
37. J. T. Kristensen and P. Burelli, "Strategies for using proximal policy optimization in mobile puzzle games," in *Proceedings of the 15th International Conference on the Foundations of Digital Games*, Bugibba, Malta, 2020.
38. L. Mugrai, F. Silva, C. Holmgård, and J. Togelius, "Automated playtesting of matching tile games," in *2019 IEEE Conference on Games (CoG)*, London, UK, 2019.
39. Y. Shin, J. Kim, K. Jin, and Y. B. Kim, "Playtesting in match 3 game using strategic plays via reinforcement learning," *IEEE Access*, vol. 8, pp. 51593–51600, 2020.
40. I. Kamaldinov and I. Makarov, "Deep reinforcement learning in match-3 game," in *2019 IEEE Conference on Games (CoG)*, London, UK, 2019.
41. E. R. Poromaa, *Crushing candy crush: predicting human success rate in a mobile game using Monte-Carlo tree search*, [M.S. thesis], KTH, School of Computer Science and Communication (CSC), 2017.
42. J. Schulman, F. Wolski, P. Dhariwal, A. Radford, and O. Klimov, "Proximal policy optimization algorithms," 2017, http://arxiv.org/abs/1707.06347.
43. Y. Zhao, I. Borovikov, F. de Mesentier Silva et al., "Winning is not everything: enhancing game development with intelligent agents," *IEEE Transactions on Games*, vol. 12, no. 2, pp. 199–212, 2020.
44. "Appbrain: Google play ranking: the top grossing puzzle games in the United States," https://www.appbrain.com/stats/google-play-rankings/topgrossing/puzzle/us#.
45. N. Srivastava, G. Hinton, A. Krizhevsky, I. Sutskever, and R. Salakhutdinov, "Dropout: a simple way to prevent neural networks from overfitting," *The Journal of Machine Learning Research*, vol. 15, no. 1, pp. 1929–1958, 2014.
46. S. Rendle, "Factorization machines with libFM," *ACM Transactions on Intelligent Systems and Technology*, vol. 3, no. 3, 2012.
47. A. Justel and D. Peña, "Gibbs sampling will fail in outlier problems with strong masking," *Journal of Computational and Graphical Statistics*, vol. 5, no. 2, pp. 176–189, 1996.
48. Y. Juan, Y. Zhuang, W.-S. Chin, and C.-J. Lin, "Field-aware factorization machines for CTR prediction," in *Proceedings of the 10th ACM Conference on Recommender Systems*, pp. 43–50, Boston, Massachusetts, USA, 2016.
49. F. Tahmasebi, M. Meghdadi, S. Ahmadian, and K. Valiallahi, "A hybrid recommendation system based on profile expansion technique to alleviate cold start problem," *Multimedia Tools and Applications*, vol. 80, no. 2, pp. 2339–2354, 2021.
50. K. Souchleris, G. K. Sidiropoulos, and G. A. Papakostas, "Reinforcement learning in game industry—review, prospects and challenges," *Applied Sciences*, vol. 13, no. 4, 2023, https://www.mdpi.com/2076-3417/13/4/2443.
51. O. Vinyals, T. Ewalds, S. Bartunov et al., "Starcraft II: a new challenge for reinforcement learning," 2017, https://arxiv.org/abs/1708.04782.
52. C. Holmgård, A. Liapis, J. Togelius, and G. Yannakakis, "Monte-Carlo tree search for persona based player modeling," *Proceedings of the AAAI Conference on Artificial Intelligence and Interactive Digital Entertainment*, vol. 11, no. 5, pp. 8–14, 2015.
53. J. T. Kristensen and P. Burelli, *Operationalising difficulty in puzzle games*, [Ph.D. thesis], IT University of Copenhagen, 2022.
54. A. Raffin, A. Hill, A. Gleave, A. Kanervisto, M. Ernestus, and N. Dormann, "Stable-baselines 3: reliable reinforcement learning implementations," *Journal of Machine Learning Research*, vol. 22, no. 268, pp. 1–8, 2021, http://jmlr.org/papers/v22/20-1364.html.
55. F. Pardo, A. Tavakoli, V. Levdik, and P. Kormushev, "Time limits in reinforcement learning," in *Proceedings of the 35th International Conference on Machine Learning*, ser. Proceedings of Machine Learning Research, J. Dy and A. Krause, Eds., vol. 80, pp. 4045–4054, PMLR, 2018, https://proceedings.mlr.press/v80/pardo18a.html.
56. F. Pedregosa, G. Varoquaux, A. Gramfort et al., "Scikit-learn: machine learning in Python," *Journal of Machine Learning Research*, vol. 12, pp. 2825–2830, 2011.
