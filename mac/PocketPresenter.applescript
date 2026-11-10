-- Pocket Presenter.app: a stay-open applet. Opening it starts the bundled present.py and opens the drop page in
-- your browser; clicking the Dock icon opens the page again; quitting the app stops the server.
on run
	startPresenter()
end run

on reopen
	startPresenter()
end reopen

on startPresenter()
	try
		do shell script quoted form of (POSIX path of (path to resource "launch.sh")) & " start"
	on error msg
		display alert "Pocket Presenter couldn't start" message msg as critical
		quit
	end try
end startPresenter

on quit
	try
		do shell script quoted form of (POSIX path of (path to resource "launch.sh")) & " stop"
	end try
	continue quit
end quit
