# Planning Poker Webapp

## Behavioural Requirements

- MUST prompt any new user to enter their name 
- MUST store the user's name in client-side storage (e.g. localStorage) so that they don't have to enter it again on subsequent visits
- MUST be able to create a ‘room’ or ‘session’ - this will forward the user to a unique URL and designate them as the session creator. The session creator will have the ability to manage the session (e.g. start/stop voting rounds, reset votes, etc.)
- MUST be able to share room/session URLs with other users - navigating to the page will add the user to the session
- MUST support multiple sessions at the same time - each session should be isolated from others, so users in one session cannot see or interact with users in another session
- MUST display a list of users currently in the session - this can be a simple list of names, and should update in real-time as users join or leave the session
- MUST allow all users in a session to set themselves to either ‘developer’ or ‘observer’ roles - developers can vote on ticket size, observers can only view the votes. Both the creator of the session and any user joining can change their role at any time.
- MUST allow users to vote on ticket size in rounds - each round will have a (optional) ticket description and a voting interface. The voting interface should allow users to select from the following set of predefined values (modified Fibonacci) - 1, 2, 3, 5, 8, 13, 20, 40, 100. Once a user has voted, they should be able to change their vote until the session creator decides to end the voting round.
- MUST display which users have voted and which have not during voting - this can be a simple indicator next to each user's name in the user list
- MUST hide the values voted for from other users during voting
- MUST allow the session creator to end the voting round and reveal all votes at once
- MUST allow the session creator to reset votes and start a new round with a new ticket description
- MUST display the average vote for each round once votes are revealed
- MUST display the highest and lowest votes for each round once votes are revealed

## Notes

Styling and UI design are not the focus of this project, so a simple and functional interface is sufficient. The main focus should be on implementing the required functionality and ensuring that the application works correctly in a real-time multi-user environment.

For technical implementation, this should be written in NodeJS/Javascript. You can use whichever libraries or frameworks you'd prefer, but the application should be able to run locally with minimal setup (e.g. `npm install` and `npm start`). 

The app should able to run both in localhost and in a deployed environment, though we'll initially focus on the localhost setup for development and testing.

No databases - the app is not sensitive in nature and we're only storing usernames, so client-side storage is fine. You can use WebSockets or any other real-time communication method to ensure that updates are reflected across all users in a session immediately - ideally this will include some method of handling dropped connections and ensuring that the user list and voting status remain accurate even if users disconnect and reconnect.