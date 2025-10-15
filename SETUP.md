# Setup your script


1. Fork the repository by clicking [here](https://github.com/aditeyaS/8bp-free-gift-collector/fork) or through the fork button.

</br>

2. A new repo will be created at `https://github.com/<username>/8bp-free-gift-collector`

</br>

3. Clone the forked repo.
```bash
git clone https://github.com/<username>/8bp-free-gift-collector
```

</br>

4. Go inside the directory
```bash
cd 8bp-free-gift-collector
```

</br>

5. Install the dependencies
```bash
npm i
```

</br>

6. Setup script
```bash
npm run setup
```
> [!IMPORTANT]  
> You will be asked to enter your user id. Please enter it without spaces/dashes etc.

</br>

7. (Optional) Update script run time
  - goto [collect-gift.yml](.github/workflows/collect-gift.yml) - `.github/workflows/collect-gift.yml`
  - update the cron time

</br>

8. Add and commit the changes
```bash
git add .
git commit -m "setup complete"
```

</br>

9. Push your changes
```bash
git push
```

</br>

> 🎉 Congratulations!

If you face any problems, please raise an [issue](https://github.com/aditeyaS/8bp-free-gift-collector/issues/new)
